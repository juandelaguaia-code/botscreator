import {
  buildSystemPrompt,
  CHANNELS,
  type Channel,
  type ConversationDetailDto,
  type ConversationFilter,
  leadUpdateSchema,
  loginInputSchema,
  loginWithEmailSchema,
  noteInputSchema,
  type PlaygroundReplyDto,
  type PromptPreviewDto,
  pauseInputSchema,
  playgroundInputSchema,
  replyInputSchema,
  type SessionDto,
  type SettingsDto,
  settingsUpdateSchema,
} from "@yunque/core";
import { type Context, Hono } from "hono";
import { channelStatuses, deliver } from "../channels/registry.js";
import { SETTINGS_KEYS } from "../engine/config.js";
import { PAUSE_FOREVER } from "../engine/engine.js";
import { configuredProviders } from "../services.js";
import type { AppEnv } from "../types.js";
import { agencyApi } from "./agency.js";
import { analyticsApi } from "./analytics.js";
import { allowedTabs, enforceTabs, login, logout, requireAuth, resolveActor } from "./auth.js";
import { brandingApi } from "./branding.js";
import { toConversationDto, toLeadDto, toMessageDto, toTicketDto } from "./dto.js";
import { exportApi } from "./export.js";
import { readJson } from "./http.js";
import { integrationsApi } from "./integrations.js";
import { knowledgeApi } from "./knowledge.js";
import { promptApi, snapshotProfile } from "./prompt.js";
import { accessApi, teamApi } from "./team.js";

const FILTERS: ConversationFilter[] = ["all", "needs_human", "unread", "leads"];

export const adminApi = new Hono<AppEnv>();

// ---------- sesión (públicas) ----------

adminApi.post("/login", async (c) => {
  const body = (await c.req.raw.json().catch(() => null)) as unknown;
  const withEmail = loginWithEmailSchema.safeParse(body);
  if (withEmail.success) return login(c, withEmail.data);
  const master = loginInputSchema.safeParse(body);
  if (!master.success) return c.json({ error: "Escribe la contraseña." }, 400);
  return login(c, { password: master.data.password });
});

adminApi.post("/logout", (c) => logout(c));

adminApi.get("/session", async (c) => {
  const { profile, settings } = await c.get("services").config();
  const actor = await resolveActor(c);
  const { hiddenTabs: _hidden, ...branding } = settings.branding;
  const dto: SessionDto = {
    authenticated: actor !== null,
    botName: settings.branding.panelName || profile.name,
    hasPassword: Boolean(c.env.DASHBOARD_PASSWORD),
    actor,
    allowedTabs: actor ? allowedTabs(actor, settings) : null,
    branding,
  };
  return c.json(dto);
});

adminApi.route("/", accessApi);

// ---------- todo lo demás requiere sesión ----------

adminApi.use("*", requireAuth);
adminApi.use("*", enforceTabs);

adminApi.route("/", teamApi);
adminApi.route("/", brandingApi);

adminApi.route("/", knowledgeApi);
adminApi.route("/export", exportApi);
adminApi.route("/", analyticsApi);
adminApi.route("/", integrationsApi);
adminApi.route("/", agencyApi);
adminApi.route("/", promptApi);

adminApi.get("/summary", async (c) => c.json(await c.get("services").store.summary(Date.now())));

adminApi.get("/conversations", async (c) => {
  const filterParam = c.req.query("filter") as ConversationFilter | undefined;
  const filter = filterParam && FILTERS.includes(filterParam) ? filterParam : "all";
  const rows = await c.get("services").store.listConversations(filter, 100, c.req.query("q"));
  return c.json({ conversations: rows.map(toConversationDto) });
});

adminApi.get("/conversations/:id", async (c) => {
  const { store } = c.get("services");
  const id = c.req.param("id");
  const row = await store.getConversationRow(id);
  if (!row) return c.json({ error: "Conversación no encontrada" }, 404);
  if (row.unread > 0) await store.updateConversation(id, { unread: 0 });
  const messages = await store.listMessages(id, 200);
  const dto: ConversationDetailDto = {
    ...toConversationDto({ ...row, unread: 0 }),
    messages: messages.map(toMessageDto),
  };
  return c.json(dto);
});

adminApi.post("/conversations/:id/reply", async (c) => {
  const input = await readJson(c.req.raw, replyInputSchema);
  if (!input) return c.json({ error: "Escribe un mensaje." }, 400);
  const { engine, store, senders } = c.get("services");
  const id = c.req.param("id");
  const existing = await store.getConversation(id);
  if (!existing) return c.json({ error: "Conversación no encontrada" }, 404);

  const { message, conversation } = await engine.humanReply(id, input.text);
  const contact = await store.getContact(conversation.contactId);
  const result = contact
    ? await deliver(
        senders,
        conversation.channel,
        contact.externalId,
        { text: input.text },
        {
          lastCustomerMessageAt: conversation.lastCustomerMessageAt,
          now: Date.now(),
        },
      )
    : { delivered: false as const, reason: "Contacto no encontrado" };
  return c.json({
    message: toMessageDto(message),
    delivered: result.delivered,
    deliveryError: result.delivered ? null : result.reason,
  });
});

adminApi.post("/conversations/:id/note", async (c) => {
  const input = await readJson(c.req.raw, noteInputSchema);
  if (!input) return c.json({ error: "Escribe la nota." }, 400);
  const { store } = c.get("services");
  const id = c.req.param("id");
  if (!(await store.getConversation(id)))
    return c.json({ error: "Conversación no encontrada" }, 404);
  const message = await store.addMessage({
    conversationId: id,
    role: "note",
    content: input.text,
    meta: { author: "admin" },
  });
  return c.json({ message: toMessageDto(message) });
});

adminApi.post("/conversations/:id/pause", async (c) => {
  const input = await readJson(c.req.raw, pauseInputSchema);
  if (!input) return c.json({ error: "Duración inválida." }, 400);
  const { store } = c.get("services");
  const id = c.req.param("id");
  if (!(await store.getConversation(id)))
    return c.json({ error: "Conversación no encontrada" }, 404);
  const pausedUntil = input.minutes === null ? PAUSE_FOREVER : Date.now() + input.minutes * 60_000;
  await store.updateConversation(id, { pausedUntil });
  return c.json({ pausedUntil });
});

adminApi.post("/conversations/:id/resume", async (c) => {
  const { store } = c.get("services");
  const id = c.req.param("id");
  if (!(await store.getConversation(id)))
    return c.json({ error: "Conversación no encontrada" }, 404);
  await store.updateConversation(id, { pausedUntil: null, needsHuman: false });
  return c.json({ ok: true });
});

adminApi.get("/leads", async (c) => {
  const leads = await c.get("services").store.listLeads(500);
  return c.json({ leads: leads.map(toLeadDto) });
});

adminApi.patch("/leads/:id", async (c) => {
  const input = await readJson(c.req.raw, leadUpdateSchema);
  if (!input) return c.json({ error: "Datos inválidos." }, 400);
  const lead = await c.get("services").store.updateLead(c.req.param("id"), input);
  if (!lead) return c.json({ error: "Lead no encontrado" }, 404);
  return c.json({ lead: toLeadDto(lead) });
});

adminApi.get("/tickets", async (c) => {
  const status = c.req.query("status");
  const filter = status === "resolved" || status === "all" ? status : "open";
  const tickets = await c.get("services").store.listTickets(filter, 200);
  return c.json({ tickets: tickets.map(toTicketDto) });
});

adminApi.post("/tickets/:id/resolve", async (c) => {
  const ok = await c.get("services").store.resolveTicket(c.req.param("id"));
  if (!ok) return c.json({ error: "El ticket no existe o ya estaba resuelto" }, 404);
  return c.json({ ok: true });
});

async function settingsDto(c: Context<AppEnv>): Promise<SettingsDto> {
  const { profile, settings } = await c.get("services").config();
  return {
    profile,
    settings,
    configuredProviders: configuredProviders(c.env),
    channels: {
      web: true,
      telegram: Boolean(c.env.TELEGRAM_BOT_TOKEN && c.env.TELEGRAM_WEBHOOK_SECRET),
    },
    knowledge: c.get("services").knowledge.engineInfo(),
  };
}

adminApi.get("/settings", async (c) => c.json(await settingsDto(c)));

/** Estado de los canales (pestaña Conexiones). Nunca expone valores de secretos. */
adminApi.get("/connections", async (c) => {
  const lastInbound = await c.get("services").store.lastInboundByChannel();
  const base = c.env.PUBLIC_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
  return c.json({
    channels: channelStatuses(c.env).map((ch) => ({
      ...ch,
      webhookUrl: ch.webhookPath ? `${base}${ch.webhookPath}` : null,
      lastInboundAt: lastInbound[ch.channel] ?? null,
    })),
    notifications: c.get("services").notifier.channels,
    transcription: Boolean(c.env.AI),
  });
});

/** El prompt tal como lo recibe el modelo, por secciones (lo editable y lo bloqueado 🔒). */
adminApi.get("/prompt", async (c) => {
  const channelParam = c.req.query("channel") as Channel | undefined;
  const channel = channelParam && CHANNELS.includes(channelParam) ? channelParam : "web";
  const { config, knowledge } = c.get("services");
  const { profile, settings } = await config();
  const built = buildSystemPrompt({
    profile,
    channel,
    now: new Date(),
    knowledgeBase: await knowledge.hasDocuments(),
    buttons: settings.buttonsEnabled,
  });
  const dto: PromptPreviewDto = {
    channel,
    sections: built.sections,
    volatile: built.volatile,
    totalChars: built.stable.length,
  };
  return c.json(dto);
});

adminApi.put("/settings", async (c) => {
  const input = await readJson(c.req.raw, settingsUpdateSchema);
  if (!input) return c.json({ error: "Configuración inválida. Revisa los campos." }, 400);
  const { store } = c.get("services");
  if (input.profile) {
    await snapshotProfile(c.env.DB, store, "Antes de guardar", c.get("actor")?.name ?? null);
    await store.setSetting(SETTINGS_KEYS.profile, input.profile);
  }
  if (input.settings) await store.setSetting(SETTINGS_KEYS.settings, input.settings);
  return c.json(await settingsDto(c));
});

adminApi.post("/playground", async (c) => {
  const input = await readJson(c.req.raw, playgroundInputSchema);
  if (!input) return c.json({ error: "Escribe un mensaje." }, 400);
  const result = await c.get("services").engine.handleInbound({
    channel: "playground",
    externalUserId: `pg_${input.sessionId}`,
    userName: "Prueba del panel",
    text: input.text,
  });
  const dto: PlaygroundReplyDto = {
    reply: result.reply,
    buttons: result.buttons,
    conversationId: result.conversationId,
    model: result.model ?? null,
    handoff: result.handoff,
    blocked: result.blocked,
    passages: result.passages,
  };
  return c.json(dto);
});
