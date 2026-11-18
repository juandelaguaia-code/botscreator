import {
  type AgencyClientDto,
  type AgencyLeadDto,
  agencyClientInputSchema,
  type LeadDto,
  type SummaryDto,
} from "@yunque/core";
import { Hono } from "hono";
import { newId } from "../lib/crypto.js";
import type { AppEnv } from "../types.js";
import { readJson } from "./http.js";

/**
 * Modo agencia: este bot funciona como central de los bots de tus clientes. Cada bot cliente se
 * registra con su URL y su token de agencia (secreto AGENCY_TOKEN de ese bot) y se lee en vivo:
 * nada de sus datos se copia aquí salvo lo que se muestra en el momento.
 */
export const agencyApi = new Hono<AppEnv>();

interface ClientRow {
  id: string;
  name: string;
  niche: string | null;
  url: string;
  token: string;
  monthly_fee: number | null;
}

const TIMEOUT = 6000;

async function remote<T>(client: ClientRow, path: string): Promise<T> {
  const res = await fetch(`${client.url.replace(/\/$/, "")}${path}`, {
    headers: { authorization: `Bearer ${client.token}` },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (res.status === 401) throw new Error("Token de agencia rechazado");
  if (!res.ok) throw new Error(`Respondió ${res.status}`);
  return (await res.json()) as T;
}

async function clients(db: D1Database): Promise<ClientRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM agency_clients ORDER BY name")
    .all<ClientRow>();
  return results;
}

async function liveStatus(client: ClientRow): Promise<AgencyClientDto> {
  const base: Omit<AgencyClientDto, "online" | "version" | "summary" | "error"> = {
    id: client.id,
    name: client.name,
    niche: client.niche,
    url: client.url,
    monthlyFee: client.monthly_fee,
  };
  try {
    const [health, summary] = await Promise.all([
      remote<{ ok: boolean; version?: string }>(client, "/healthz"),
      remote<SummaryDto>(client, "/admin/api/summary"),
    ]);
    return { ...base, online: health.ok, version: health.version ?? null, summary, error: null };
  } catch (error) {
    return {
      ...base,
      online: false,
      version: null,
      summary: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

agencyApi.get("/agency/clients", async (c) => {
  const list = await clients(c.env.DB);
  return c.json({ clients: await Promise.all(list.map(liveStatus)) });
});

agencyApi.post("/agency/clients", async (c) => {
  const input = await readJson(c.req.raw, agencyClientInputSchema);
  if (!input)
    return c.json({ error: "Nombre, URL del bot y token de agencia (mínimo 16 caracteres)." }, 400);
  const row: ClientRow = {
    id: newId("ag"),
    name: input.name,
    niche: input.niche ?? null,
    url: input.url.replace(/\/$/, ""),
    token: input.token,
    monthly_fee: input.monthlyFee ?? null,
  };
  const status = await liveStatus(row);
  if (!status.online)
    return c.json({ error: `No pude conectar con ese bot: ${status.error}` }, 422);
  try {
    await c.env.DB.prepare(
      "INSERT INTO agency_clients (id, name, niche, url, token, monthly_fee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(row.id, row.name, row.niche, row.url, row.token, row.monthly_fee, Date.now())
      .run();
  } catch {
    return c.json({ error: "Ese bot ya está en tu portafolio." }, 409);
  }
  return c.json({ client: status }, 201);
});

agencyApi.delete("/agency/clients/:id", async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM agency_clients WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  if (!res.meta.changes) return c.json({ error: "Cliente no encontrado" }, 404);
  return c.json({ ok: true });
});

/** Bandeja de clientes de todos los bots, leída en vivo. */
agencyApi.get("/agency/leads", async (c) => {
  const list = await clients(c.env.DB);
  const results = await Promise.allSettled(
    list.map(async (client) => {
      const { leads } = await remote<{ leads: LeadDto[] }>(client, "/admin/api/leads");
      return leads.map(
        (l): AgencyLeadDto => ({ ...l, clientId: client.id, clientName: client.name }),
      );
    }),
  );
  const leads = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 500);
  const failed = results
    .map((r, i) => (r.status === "rejected" ? list[i]?.name : null))
    .filter((n): n is string => Boolean(n));
  return c.json({ leads, failed });
});
