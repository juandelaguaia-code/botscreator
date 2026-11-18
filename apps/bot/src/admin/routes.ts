import {
  type ConversationDetailDto,
  type ConversationFilter,
  leadUpdateSchema,
  loginInputSchema,
  noteInputSchema,
  type PlaygroundReplyDto,
  pauseInputSchema,
  playgroundInputSchema,
  replyInputSchema,
  type SettingsDto,
  settingsUpdateSchema,
} from "@yunque/core";
import { type Context, Hono } from "hono";
import { sendTelegramMessage } from "../channels/telegram.js";
import { SETTINGS_KEYS } from "../engine/config.js";
import { PAUSE_FOREVER } from "../engine/engine.js";
import { configuredProviders } from "../services.js";
import type { AppEnv } from "../types.js";
import { isAuthenticated, login, logout, requireAuth } from "./auth.js";
import { toConversationDto, toLeadDto, toMessageDto, toTicketDto } from "./dto.js";
import { exportApi } from "./export.js";
import { readJson } from "./http.js";
import { knowledgeApi } from "./knowledge.js";

const FILTERS: ConversationFilter[] = ["all", "needs_human", "unread", "leads"];

export const adminApi = new Hono<AppEnv>();

// ---------- sesión (públicas) ----------

adminApi.post("/login", async (c) => {
  const input = await readJson(c.req.raw, loginInputSchema);
  if (!input) return c.json({ error: "Escribe la contraseña." }, 400);
  return login(c, input.password);
});

adminApi.post("/logout", (c) => logout(c));

adminApi.get("/session", async (c) => {
  const { profile } = await c.get("services").config();
  return c.json({
    authenticated: await isAuthenticated(c),
    botName: profile.name,
    hasPassword: Boolean(c.env.DASHBOARD_PASSWORD),
  });
});

// ---------- todo lo demás requiere sesión ----------

adminApi.use("*", requireAuth);

adminApi.route("/", knowledgeApi);
adminApi.route("/export", exportApi);

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
  const { engine, store } = c.get("services");
  const id = c.req.param("id");
  const existing = await store.getConversation(id);
  if (!existing) return c.json({ error: "Conversación no encontrada" }, 404);

  const { message, conversation } = await engine.humanReply(id, input.text);
  const contact = await store.getContact(conversation.contactId);

  // web y prueba: el widget recoge el mensaje al consultar; Telegram se entrega ahora.
  let delivered = conversation.channel === "web" || conversation.channel === "playground";
  let deliveryError: string | null = null;
  if (conversation.channel === "telegram" && contact) {
    if (!c.env.TELEGRAM_BOT_TOKEN) deliveryError = "Falta TELEGRAM_BOT_TOKEN";
    else {
      try {
        await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, contact.externalId, input.text);
        delivered = true;
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : String(error);
      }
    }
  }
  return c.json({ message: toMessageDto(message), delivered, deliveryError });
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

adminApi.put("/settings", async (c) => {
  const input = await readJson(c.req.raw, settingsUpdateSchema);
  if (!input) return c.json({ error: "Configuración inválida. Revisa los campos." }, 400);
  const { store } = c.get("services");
  if (input.profile) await store.setSetting(SETTINGS_KEYS.profile, input.profile);
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
