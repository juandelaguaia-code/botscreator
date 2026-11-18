import { toCsv } from "@yunque/core";
import { type Context, Hono } from "hono";
import type { AppEnv } from "../types.js";
import { toLeadDto } from "./dto.js";

/** Exportar: tus datos son tuyos. Leads y conversaciones en CSV (Excel/Sheets) o JSON. */
export const exportApi = new Hono<AppEnv>();

const MAX_MESSAGES = 50_000;

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(c: Context<AppEnv>, body: string, filename: string, type: string): Response {
  return c.body(body, 200, {
    "content-type": `${type}; charset=utf-8`,
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
  });
}

const iso = (ms: number) => new Date(ms).toISOString();

exportApi.get("/leads.csv", async (c) => {
  const leads = await c.get("services").store.listLeads(10_000);
  const csv = toCsv(
    [
      "nombre",
      "telefono",
      "correo",
      "interes",
      "estado",
      "notas",
      "canal",
      "conversacion",
      "fecha",
    ],
    leads.map((l) => [
      l.name,
      l.phone,
      l.email,
      l.interest,
      l.status,
      l.notes,
      l.channel,
      l.conversationId,
      iso(l.createdAt),
    ]),
  );
  // BOM para que Excel reconozca los acentos
  return download(c, `\uFEFF${csv}`, `leads-${stamp()}.csv`, "text/csv");
});

exportApi.get("/leads.json", async (c) => {
  const leads = await c.get("services").store.listLeads(10_000);
  return download(
    c,
    JSON.stringify(leads.map(toLeadDto), null, 2),
    `leads-${stamp()}.json`,
    "application/json",
  );
});

exportApi.get("/messages.csv", async (c) => {
  const rows = await c.get("services").store.exportMessages(MAX_MESSAGES);
  const csv = toCsv(
    ["conversacion", "canal", "cliente", "id_cliente", "autor", "mensaje", "fecha"],
    rows.map((r) => [
      r.conversationId,
      r.channel,
      r.contactName,
      r.contactExternalId,
      r.role,
      r.content,
      iso(r.createdAt),
    ]),
  );
  return download(c, `\uFEFF${csv}`, `mensajes-${stamp()}.csv`, "text/csv");
});

exportApi.get("/conversations.json", async (c) => {
  const rows = await c.get("services").store.exportMessages(MAX_MESSAGES);
  const conversations = new Map<
    string,
    {
      id: string;
      channel: string;
      contact: { id: string; name: string | null; externalId: string };
      messages: Array<{ role: string; content: string; createdAt: string }>;
    }
  >();
  for (const r of rows) {
    let conv = conversations.get(r.conversationId);
    if (!conv) {
      conv = {
        id: r.conversationId,
        channel: r.channel,
        contact: { id: r.contactId, name: r.contactName, externalId: r.contactExternalId },
        messages: [],
      };
      conversations.set(r.conversationId, conv);
    }
    conv.messages.push({ role: r.role, content: r.content, createdAt: iso(r.createdAt) });
  }
  return download(
    c,
    JSON.stringify([...conversations.values()], null, 2),
    `conversaciones-${stamp()}.json`,
    "application/json",
  );
});
