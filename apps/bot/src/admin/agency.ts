import {
  type AgencyClientDto,
  type AgencyLeadDto,
  agencyAccessInputSchema,
  agencyClientInputSchema,
  agencyClientUpdateSchema,
  type LeadDto,
  MAX_AGENCY_COLLABORATORS,
  type SummaryDto,
} from "@yunque/core";
import { Hono } from "hono";
import { newId } from "../lib/crypto.js";
import { publicUser, TeamStore } from "../store/team.js";
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

/** Renovar el token (p. ej. con `pnpm bot vincular`), el nombre, el giro o la mensualidad. */
agencyApi.patch("/agency/clients/:id", async (c) => {
  const input = await readJson(c.req.raw, agencyClientUpdateSchema);
  if (!input) return c.json({ error: "Datos inválidos." }, 400);
  const current = await c.env.DB.prepare("SELECT * FROM agency_clients WHERE id = ?")
    .bind(c.req.param("id"))
    .first<ClientRow>();
  if (!current) return c.json({ error: "Cliente no encontrado" }, 404);
  const row: ClientRow = {
    ...current,
    name: input.name ?? current.name,
    niche: input.niche ?? current.niche,
    token: input.token ?? current.token,
    monthly_fee: input.monthlyFee !== undefined ? input.monthlyFee : current.monthly_fee,
  };
  const status = await liveStatus(row);
  if (input.token && !status.online)
    return c.json({ error: `El bot no aceptó el token nuevo: ${status.error}` }, 422);
  await c.env.DB.prepare(
    "UPDATE agency_clients SET name = ?, niche = ?, token = ?, monthly_fee = ? WHERE id = ?",
  )
    .bind(row.name, row.niche, row.token, row.monthly_fee, row.id)
    .run();
  return c.json({ client: status });
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

// ---------- equipo de agencia ----------

/** Solo el dueño (contraseña maestra o token de agencia) decide quién más entra a Modo agencia. */
const ownerOnly = (c: { get: (k: "actor") => { role: string } | undefined }) =>
  c.get("actor")?.role === "owner";

agencyApi.get("/agency/collaborators", async (c) => {
  if (!ownerOnly(c))
    return c.json({ error: "Solo el dueño administra el equipo de agencia." }, 403);
  const users = (await new TeamStore(c.env.DB).list()).map(publicUser);
  return c.json({
    collaborators: users.filter((u) => u.agencyAccess),
    candidates: users.filter((u) => !u.agencyAccess && u.status === "active"),
    max: MAX_AGENCY_COLLABORATORS,
  });
});

agencyApi.put("/agency/collaborators/:userId", async (c) => {
  if (!ownerOnly(c))
    return c.json({ error: "Solo el dueño administra el equipo de agencia." }, 403);
  const input = await readJson(c.req.raw, agencyAccessInputSchema);
  if (!input) return c.json({ error: "Permiso inválido (editar, solo lectura o ninguno)." }, 400);
  const team = new TeamStore(c.env.DB);
  const user = await team.get(c.req.param("userId"));
  if (!user) return c.json({ error: "Acceso no encontrado" }, 404);
  if (input.access && user.status !== "active")
    return c.json({ error: "Esa persona todavía no tiene un acceso activo." }, 409);
  if (input.access && !user.agencyAccess) {
    const current = (await team.list()).filter((u) => u.agencyAccess).length;
    if (current >= MAX_AGENCY_COLLABORATORS)
      return c.json(
        { error: `El equipo de agencia admite hasta ${MAX_AGENCY_COLLABORATORS} colaboradores.` },
        409,
      );
  }
  await team.setAgencyAccess(user.id, input.access);
  const label = { edit: "puede editar", read: "solo lectura" } as const;
  await team.audit(
    c.get("actor") ?? null,
    input.access ? "Sumó al equipo de agencia" : "Quitó del equipo de agencia",
    input.access ? `${user.name} (${label[input.access]})` : user.name,
  );
  return c.json({ user: publicUser({ ...user, agencyAccess: input.access }) });
});
