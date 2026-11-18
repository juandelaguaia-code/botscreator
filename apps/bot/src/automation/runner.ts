import { type BotSettings, type BusinessProfile, systemMessage } from "@yunque/core";
import { costUsd, type GenerateResponse, type LlmProvider } from "@yunque/llm";
import { deliver } from "../channels/registry.js";
import type { OutboundMessage } from "../channels/types.js";
import type { Services } from "../services.js";
import { analyzeConversation, writeFollowUp } from "./ai.js";
import {
  type ClosedConversation,
  type Insight,
  type OutreachCandidate,
  PUSH_CHANNELS,
} from "./store.js";

const HOUR = 3_600_000;
/** Silencio tras el cual una conversación se da por terminada. */
export const CLOSE_AFTER_MS = 3 * HOUR;
const MAX_CLOSE_PER_RUN = 25;
const MAX_FOLLOWUPS_PER_RUN = 10;

export interface AutomationReport {
  closed: number;
  analyzed: number;
  alerts: number;
  surveys: number;
  reviews: number;
  hunted: number;
  noShows: number;
  reminders: number;
  campaignSent: number;
  dailyReport: boolean;
  watchdog: boolean;
  errors: string[];
}

interface RunContext {
  services: Services;
  profile: BusinessProfile;
  settings: BotSettings;
  provider: LlmProvider | null;
  now: number;
  report: AutomationReport;
}

/** Fecha y hora locales del negocio (para el reporte nocturno). */
export function localClock(now: number, timezone: string): { date: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
  } catch {
    const d = new Date(now);
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
  }
}

async function step(ctx: RunContext, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    ctx.report.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function recordUsage(
  ctx: RunContext,
  conversationId: string | null,
  response: GenerateResponse,
) {
  await ctx.services.store.recordUsage({
    conversationId,
    provider: response.provider,
    model: response.model,
    ...response.usage,
    costUsd: costUsd(response.model, response.usage),
  });
}

/** Guarda un mensaje que el bot inició y, si se pide, reabre la conversación para seguir el hilo. */
async function saveProactive(
  ctx: RunContext,
  conversationId: string,
  text: string,
  kind: string,
  reopen: boolean,
) {
  const { store } = ctx.services;
  await store.addMessage({ conversationId, role: "assistant", content: text, meta: { kind } });
  await store.updateConversation(conversationId, {
    lastMessageAt: ctx.now,
    lastMessagePreview: text.slice(0, 140),
    ...(reopen ? { status: "open" as const } : {}),
  });
}

async function send(
  ctx: RunContext,
  channel: ClosedConversation["channel"],
  externalId: string,
  lastCustomerAt: number | null,
  message: OutboundMessage,
) {
  return deliver(ctx.services.senders, channel, externalId, message, {
    lastCustomerMessageAt: lastCustomerAt,
    now: ctx.now,
  });
}

// ---------- Vigilante + encuestas + reseñas ----------

async function closeAndAnalyze(ctx: RunContext): Promise<void> {
  const { automation, store, knowledge, notifier } = ctx.services;
  const closed = await automation.closeIdle(ctx.now - CLOSE_AFTER_MS, MAX_CLOSE_PER_RUN);
  ctx.report.closed += closed.length;

  for (const conv of closed) {
    const messages = await store.listMessages(conv.id, 80);
    if (!messages.some((m) => m.role === "user")) continue;
    const contact = await store.getContact(conv.contactId);
    if (!contact) continue;

    let insight: Insight | null = null;
    if (ctx.settings.automation.vigilante && ctx.provider) {
      const result = await analyzeConversation(ctx.provider, messages).catch(() => null);
      if (result) {
        insight = result.insight;
        ctx.report.analyzed++;
        await automation.saveInsight(conv.id, result.insight, result.response.model);
        await recordUsage(ctx, conv.id, result.response);
        if (result.memory) await automation.setContactMemory(conv.contactId, result.memory);
        if (result.insight.unansweredQuestion) {
          await knowledge
            .recordGap({
              question: result.insight.unansweredQuestion,
              source: "kb_miss",
              conversationId: conv.id,
            })
            .catch(() => undefined);
        }
        const atRisk = result.insight.openSale && result.insight.sentiment === "negativo";
        if (result.insight.upset || atRisk) {
          ctx.report.alerts++;
          await notifier
            .notify({
              title: result.insight.upset ? "⚠️ Cliente molesto" : "⚠️ Venta en riesgo",
              body: `${contact.name ?? contact.externalId} (${conv.channel}) · ${result.insight.rating}/5\n${result.insight.summary}`,
              path: `/admin/bandeja/${conv.id}`,
            })
            .catch(() => undefined);
        }
      }
    }

    if (!PUSH_CHANNELS.includes(conv.channel)) continue;
    const resolved = !conv.needsHuman && (insight?.resolvedWithoutHuman ?? true) && !insight?.upset;

    if (ctx.settings.automation.surveys && resolved) {
      const claim = await automation.claimOutreach({
        kind: "encuesta",
        conversationId: conv.id,
        contactId: conv.contactId,
      });
      if (!claim) continue;
      const text = systemMessage(ctx.profile.language, "surveyQuestion");
      const sent = await send(ctx, conv.channel, contact.externalId, conv.lastCustomerMessageAt, {
        text,
      });
      if (sent.delivered) {
        ctx.report.surveys++;
        await saveProactive(ctx, conv.id, text, "encuesta", false);
      } else await automation.markOutreachFailed(claim, sent.reason);
    } else if (
      ctx.settings.automation.reviews &&
      ctx.profile.reviewUrl &&
      insight?.sentiment === "positivo" &&
      insight.rating >= 4
    ) {
      const claim = await automation.claimOutreach({
        kind: "resena",
        conversationId: conv.id,
        contactId: conv.contactId,
      });
      if (!claim) continue;
      const text = systemMessage(ctx.profile.language, "reviewInvite").replace(
        "{url}",
        ctx.profile.reviewUrl,
      );
      const sent = await send(ctx, conv.channel, contact.externalId, conv.lastCustomerMessageAt, {
        text,
      });
      if (sent.delivered) {
        ctx.report.reviews++;
        await saveProactive(ctx, conv.id, text, "resena", false);
      } else await automation.markOutreachFailed(claim, sent.reason);
    }
  }
}

// ---------- Cazador y Recupera no-shows ----------

async function followUp(
  ctx: RunContext,
  candidate: OutreachCandidate,
  kind: "cazador" | "no_show",
): Promise<boolean> {
  const { automation, store } = ctx.services;
  if (!ctx.provider) return false;
  const template = kind === "no_show" ? ctx.settings.whatsappTemplates.noShow : undefined;
  // fuera de 24 h, WhatsApp solo acepta plantillas aprobadas: sin plantilla no se intenta
  if (kind === "no_show" && candidate.channel === "whatsapp" && !template) return false;

  const claim = await automation.claimOutreach({
    kind,
    conversationId: candidate.conversationId,
    contactId: candidate.contactId,
  });
  if (!claim) return false;
  const messages = await store.listMessages(candidate.conversationId, 30);
  const { text, response } = await writeFollowUp({
    provider: ctx.provider,
    profile: ctx.profile,
    messages,
    kind,
  });
  await recordUsage(ctx, candidate.conversationId, response);
  if (!text) {
    await automation.markOutreachFailed(claim, "El modelo no redactó el mensaje");
    return false;
  }
  const sent = await send(
    ctx,
    candidate.channel,
    candidate.externalId,
    candidate.lastCustomerMessageAt,
    {
      text,
      ...(template ? { template: { ...template, params: [candidate.name ?? ""] } } : {}),
    },
  );
  if (!sent.delivered) {
    await automation.markOutreachFailed(claim, sent.reason);
    return false;
  }
  await saveProactive(ctx, candidate.conversationId, text, kind, true);
  return true;
}

async function hunt(ctx: RunContext): Promise<void> {
  if (!ctx.settings.automation.hunter) return;
  const { automation } = ctx.services;
  const sentToday = await automation.countOutreachSince("cazador", ctx.now - 24 * HOUR);
  const remaining = Math.min(
    MAX_FOLLOWUPS_PER_RUN,
    ctx.settings.automation.hunterDailyMax - sentToday,
  );
  for (const candidate of await automation.hunterCandidates(ctx.now, remaining)) {
    if (await followUp(ctx, candidate, "cazador")) ctx.report.hunted++;
  }
}

async function recoverNoShows(ctx: RunContext): Promise<void> {
  if (!ctx.settings.automation.noShows) return;
  const candidates = await ctx.services.automation.noShowCandidates(
    ctx.now,
    ctx.settings.automation.noShowAfterDays,
    MAX_FOLLOWUPS_PER_RUN,
  );
  for (const candidate of candidates) {
    if (await followUp(ctx, candidate, "no_show")) ctx.report.noShows++;
  }
}

// ---------- recordatorios de cita y campañas ----------

async function sendReminders(ctx: RunContext): Promise<void> {
  if (!ctx.settings.automation.reminders) return;
  const { integrations } = ctx.services;
  // ~24 h antes (ventana de 20 a 26 h para no perder ninguna entre corridas del cron)
  const due = await integrations.dueReminders(ctx.now + 20 * HOUR, ctx.now + 26 * HOUR);
  for (const apt of due) {
    if (!PUSH_CHANNELS.includes(apt.channel)) {
      await integrations.markReminded(apt.id);
      continue;
    }
    const when = new Intl.DateTimeFormat(
      ctx.profile.language === "espejo" ? "es-419" : ctx.profile.language,
      {
        timeZone: ctx.profile.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(new Date(apt.startAt));
    const text = systemMessage(ctx.profile.language, "appointmentReminder")
      .replace("{negocio}", ctx.profile.name)
      .replace("{fecha}", when);
    const template = ctx.settings.whatsappTemplates.reminder;
    const sent = await send(ctx, apt.channel, apt.externalId, apt.lastCustomerMessageAt, {
      text,
      ...(template ? { template: { ...template, params: [apt.attendeeName ?? "", when] } } : {}),
    });
    if (sent.delivered) {
      ctx.report.reminders++;
      if (apt.conversationId)
        await saveProactive(ctx, apt.conversationId, text, "recordatorio", false);
    }
    await integrations.markReminded(apt.id); // un solo intento: nunca repetir recordatorios
  }
}

const CAMPAIGN_BATCH = 50;

/** Envía por lotes las campañas en curso; respeta la ventana de 24 h de WhatsApp, Instagram y Messenger. */
export async function sendCampaigns(ctx: RunContext): Promise<void> {
  const { integrations } = ctx.services;
  for (const id of await integrations.sendingCampaigns()) {
    const campaign = await integrations.getCampaign(id);
    if (!campaign) continue;
    const recipients = await integrations.campaignRecipients(id, campaign.segment, CAMPAIGN_BATCH);
    if (recipients.length === 0) {
      await integrations.setCampaignStatus(id, "done");
      continue;
    }
    const template = ctx.settings.whatsappTemplates.campaign;
    for (const r of recipients) {
      const text = campaign.message
        .replaceAll("{nombre}", r.name ?? "")
        .replace(/\s+([,.!?])/g, "$1")
        .trim();
      const inWindow =
        r.lastCustomerMessageAt !== null && ctx.now - r.lastCustomerMessageAt < 24 * HOUR;
      if ((r.channel === "instagram" || r.channel === "messenger") && !inWindow) {
        await integrations.recordCampaignSend(
          id,
          r.contactId,
          "skipped",
          "Fuera de la ventana de 24 h",
        );
        continue;
      }
      if (r.channel === "whatsapp" && !inWindow && !template) {
        await integrations.recordCampaignSend(
          id,
          r.contactId,
          "skipped",
          "WhatsApp fuera de 24 h sin plantilla",
        );
        continue;
      }
      const sent = await send(ctx, r.channel, r.externalId, r.lastCustomerMessageAt, {
        text,
        ...(template ? { template: { ...template, params: [r.name ?? ""] } } : {}),
      });
      await integrations.recordCampaignSend(
        id,
        r.contactId,
        sent.delivered ? "sent" : "failed",
        sent.delivered ? undefined : sent.reason,
      );
      if (sent.delivered) ctx.report.campaignSent++;
    }
  }
}

// ---------- reporte nocturno y watchdog ----------

async function dailyReport(ctx: RunContext): Promise<void> {
  const { notifier, store, automation } = ctx.services;
  if (!ctx.settings.automation.dailyReport || notifier.channels.length === 0) return;
  const local = localClock(ctx.now, ctx.profile.timezone);
  if (local.hour < ctx.settings.automation.dailyReportHour) return;
  if ((await store.getSetting<string>("job:daily_report")) === local.date) return;

  const r = await automation.periodReport(ctx.now - 24 * HOUR, ctx.now);
  const lines = [
    `💬 ${r.conversations} conversaciones · ${r.customerMessages} mensajes de clientes`,
    `🧲 ${r.newLeads} leads nuevos`,
    `🙋 ${r.handoffs} te necesitaron`,
    `💰 ${r.openSales} ventas abiertas · ⚠️ ${r.upsetCustomers} clientes molestos`,
    ...(r.surveys ? [`⭐ ${r.surveys} encuestas · promedio ${r.surveyAverage}`] : []),
    `🤖 Gasto de IA: US$${r.costUsd.toFixed(2)}`,
  ];
  await notifier.notify({
    title: `🌙 Tu día en ${ctx.profile.name}`,
    body: lines.join("\n"),
    path: "/admin/",
  });
  await store.setSetting("job:daily_report", local.date);
  ctx.report.dailyReport = true;
}

async function watchdog(ctx: RunContext): Promise<void> {
  const { automation, store, notifier } = ctx.services;
  const failures = await automation.countAiFailuresSince(ctx.now - 30 * 60_000);
  if (failures < 3) return;
  const last = await store.getSetting<number>("job:watchdog_alert_at");
  if (last && ctx.now - last < 6 * HOUR) return; // freno anti-spam
  await notifier.notify({
    title: "🚨 Tu bot está fallando",
    body: `${failures} fallas de IA en los últimos 30 minutos. Revisa la llave y el saldo de tu proveedor de IA.`,
    path: "/admin/tickets",
  });
  await store.setSetting("job:watchdog_alert_at", ctx.now);
  ctx.report.watchdog = true;
}

/** Todo lo que corre solo cada 15 minutos. Cada paso es independiente: si uno falla, los demás siguen. */
export async function runAutomation(
  services: Services,
  now = Date.now(),
): Promise<AutomationReport> {
  const { profile, settings } = await services.config();
  let provider: LlmProvider | null = null;
  try {
    provider = services.providerFor(settings);
  } catch {
    provider = null; // sin llave: lo que necesita IA se salta, el resto corre
  }
  const report: AutomationReport = {
    closed: 0,
    analyzed: 0,
    alerts: 0,
    surveys: 0,
    reviews: 0,
    hunted: 0,
    noShows: 0,
    reminders: 0,
    campaignSent: 0,
    dailyReport: false,
    watchdog: false,
    errors: [],
  };
  const ctx: RunContext = { services, profile, settings, provider, now, report };

  await step(ctx, "vigilante", () => closeAndAnalyze(ctx));
  await step(ctx, "cazador", () => hunt(ctx));
  await step(ctx, "no-shows", () => recoverNoShows(ctx));
  await step(ctx, "recordatorios", () => sendReminders(ctx));
  await step(ctx, "campañas", () => sendCampaigns(ctx));
  await step(ctx, "reporte", () => dailyReport(ctx));
  await step(ctx, "watchdog", () => watchdog(ctx));
  return report;
}
