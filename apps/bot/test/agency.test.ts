import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

const TOKEN = "token-de-agencia-muy-largo-123456";

/** Dos bots reales: la central (agencia) y el bot de un cliente, conectados por fetch simulado. */
function twoBots() {
  const app = createApp();
  const clientEnv = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "cliente",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Barbería Don José",
    AGENCY_TOKEN: TOKEN,
  } as Env;
  const agencyEnv = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "agencia",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Mi agencia",
  } as Env;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== "https://barberia.example") return new Response("no", { status: 502 });
      return app.request(url.pathname + url.search, { headers: init?.headers ?? {} }, clientEnv);
    }),
  );

  let cookie = "";
  const agency = (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } },
      agencyEnv,
    );
  const login = async () => {
    const res = await agency("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "agencia" }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
  };
  const client = (path: string, init: RequestInit = {}) => app.request(path, init, clientEnv);
  return { agency, client, login, clientEnv };
}

afterEach(() => vi.unstubAllGlobals());

describe("token de agencia", () => {
  it("abre la API del bot solo con el token correcto", async () => {
    const { client } = twoBots();
    expect(
      (await client("/admin/api/summary", { headers: { authorization: `Bearer ${TOKEN}` } }))
        .status,
    ).toBe(200);
    expect(
      (
        await client("/admin/api/summary", {
          headers: { authorization: "Bearer otro-token-cualquiera-123" },
        })
      ).status,
    ).toBe(401);
    expect((await client("/admin/api/summary")).status).toBe(401);
  });

  it("ignora tokens de agencia demasiado cortos", async () => {
    const app = createApp();
    const env = {
      DB: createTestD1(),
      DASHBOARD_PASSWORD: "x",
      LLM_PROVIDER: "fake",
      AGENCY_TOKEN: "corto",
    } as Env;
    expect(
      (await app.request("/admin/api/summary", { headers: { authorization: "Bearer corto" } }, env))
        .status,
    ).toBe(401);
  });
});

describe("central de agencia", () => {
  it("agrega el bot de un cliente, lee sus métricas y sus leads en vivo, y lo quita", async () => {
    const { agency, client, login } = twoBots();
    await client("/api/web/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        visitorId: "visitante-agencia",
        text: "Quiero un corte, soy Pedro, pedro@correo.com",
      }),
    });
    await login();

    const bad = await agency("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({
        name: "Barbería",
        url: "https://barberia.example",
        token: "token-equivocado-1234567",
      }),
    });
    expect(bad.status).toBe(422);

    const added = await agency("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({
        name: "Barbería Don José",
        niche: "barbería",
        url: "https://barberia.example/",
        token: TOKEN,
        monthlyFee: 40,
      }),
    });
    expect(added.status).toBe(201);
    const { client: created } = (await added.json()) as {
      client: { id: string; online: boolean; summary: { newLeads30d: number } };
    };
    expect(created.online).toBe(true);
    expect(created.summary.newLeads30d).toBe(1);

    const dup = await agency("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Otra vez", url: "https://barberia.example", token: TOKEN }),
    });
    expect(dup.status).toBe(409);

    const list = (await (await agency("/admin/api/agency/clients")).json()) as {
      clients: Array<{ name: string; online: boolean; monthlyFee: number }>;
    };
    expect(list.clients).toEqual([
      expect.objectContaining({ name: "Barbería Don José", online: true, monthlyFee: 40 }),
    ]);

    const leads = (await (await agency("/admin/api/agency/leads")).json()) as {
      leads: Array<{ clientName: string; email: string }>;
      failed: string[];
    };
    expect(leads.leads[0]).toMatchObject({
      clientName: "Barbería Don José",
      email: "pedro@correo.com",
    });
    expect(leads.failed).toEqual([]);

    expect(
      (await agency(`/admin/api/agency/clients/${created.id}`, { method: "DELETE" })).status,
    ).toBe(200);
    const after = (await (await agency("/admin/api/agency/clients")).json()) as {
      clients: unknown[];
    };
    expect(after.clients).toHaveLength(0);
  });

  it("marca sin conexión a un bot caído sin romper el portafolio", async () => {
    const { agency, login } = twoBots();
    await login();
    // insertar directo un cliente que ya no responde
    const res = await agency("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({ name: "Caído", url: "https://caido.example", token: TOKEN }),
    });
    expect(res.status).toBe(422);
    const leads = (await (await agency("/admin/api/agency/leads")).json()) as { leads: unknown[] };
    expect(leads.leads).toEqual([]);
  });
});

describe("renovar el vínculo", () => {
  it("cambia el token solo si el bot lo acepta, y actualiza la mensualidad", async () => {
    const { agency, login, clientEnv } = twoBots();
    await login();
    const added = (await (
      await agency("/admin/api/agency/clients", {
        method: "POST",
        body: JSON.stringify({ name: "Don José", url: "https://barberia.example", token: TOKEN }),
      })
    ).json()) as { client: { id: string } };

    const wrong = await agency(`/admin/api/agency/clients/${added.client.id}`, {
      method: "PATCH",
      body: JSON.stringify({ token: "otro-token-que-el-bot-no-tiene-123" }),
    });
    expect(wrong.status).toBe(422);

    clientEnv.AGENCY_TOKEN = "token-nuevo-de-agencia-987654321";
    const renewed = await agency(`/admin/api/agency/clients/${added.client.id}`, {
      method: "PATCH",
      body: JSON.stringify({ token: "token-nuevo-de-agencia-987654321", monthlyFee: 55 }),
    });
    expect(renewed.status).toBe(200);
    const list = (await (await agency("/admin/api/agency/clients")).json()) as {
      clients: Array<{ online: boolean; monthlyFee: number }>;
    };
    expect(list.clients[0]).toMatchObject({ online: true, monthlyFee: 55 });
  });
});
