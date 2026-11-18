import { describe, expect, it } from "vitest";
import { MAX_FAILURES } from "../src/admin/auth.js";
import { createApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

function setup(extra: Partial<Env> = {}) {
  const env = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "clave-secreta",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Tacos Ana",
    ...extra,
  } as Env;
  const app = createApp();
  const request = (path: string, init: RequestInit = {}) => app.request(path, init, env);
  const json = (body: unknown, cookie?: string): RequestInit => ({
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const login = async () => {
    const res = await request("/admin/api/login", json({ password: "clave-secreta" }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    return cookie.split(";")[0] as string;
  };
  return { env, request, json, login };
}

describe("rutas públicas", () => {
  it("expone healthz y el widget", async () => {
    const { request } = setup();
    expect(await (await request("/healthz")).json()).toMatchObject({ ok: true });
    const widget = await request("/widget.js");
    expect(widget.headers.get("content-type")).toContain("javascript");
  });

  it("el chat web responde y deja consultar los mensajes del visitante", async () => {
    const { request, json } = setup();
    const res = await request("/api/web/chat", json({ visitorId: "visitante-123", text: "hola" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string };
    expect(body.reply).toContain("Recibí");

    const poll = await request("/api/web/messages?visitorId=visitante-123&after=0");
    const { messages } = (await poll.json()) as { messages: Array<{ role: string }> };
    expect(messages.map((m) => m.role)).toEqual(["assistant"]);
  });

  it("valida la entrada del chat web", async () => {
    const { request, json } = setup();
    expect((await request("/api/web/chat", json({ visitorId: "x", text: "" }))).status).toBe(400);
  });

  it("rechaza orígenes no permitidos cuando hay lista blanca", async () => {
    const { request, json, login } = setup();
    const cookie = await login();
    const current = (await (
      await request("/admin/api/settings", { headers: { cookie } })
    ).json()) as {
      settings: Record<string, unknown>;
    };
    await request("/admin/api/settings", {
      ...json(
        { settings: { ...current.settings, widgetAllowedOrigins: ["https://tacosana.com"] } },
        cookie,
      ),
      method: "PUT",
    });

    const ok = await request("/api/web/chat", {
      ...json({ visitorId: "visitante-123", text: "hola" }),
      headers: { "content-type": "application/json", origin: "https://tacosana.com" },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://tacosana.com");

    const blocked = await request("/api/web/chat", {
      ...json({ visitorId: "visitante-123", text: "hola" }),
      headers: { "content-type": "application/json", origin: "https://otro.com" },
    });
    expect(blocked.status).toBe(403);
  });

  it("el webhook de Telegram exige el secreto", async () => {
    const { request, json } = setup({ TELEGRAM_WEBHOOK_SECRET: "s3cr3t", TELEGRAM_BOT_TOKEN: "t" });
    expect((await request("/webhooks/telegram", json({ update_id: 1 }))).status).toBe(401);
    const ok = await request("/webhooks/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s3cr3t" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(ok.status).toBe(200);
  });
});

describe("API del panel", () => {
  it("exige sesión", async () => {
    const { request } = setup();
    expect((await request("/admin/api/summary")).status).toBe(401);
    const session = (await (await request("/admin/api/session")).json()) as {
      authenticated: boolean;
      botName: string;
    };
    expect(session).toMatchObject({ authenticated: false, botName: "Tacos Ana" });
  });

  it("bloquea tras varios intentos fallidos", async () => {
    const { request, json } = setup();
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect((await request("/admin/api/login", json({ password: "mala" }))).status).toBe(401);
    }
    const locked = await request("/admin/api/login", json({ password: "clave-secreta" }));
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBeTruthy();
  });

  it("avisa si no hay contraseña configurada", async () => {
    const { request, json } = setup({ DASHBOARD_PASSWORD: undefined });
    expect((await request("/admin/api/login", json({ password: "x" }))).status).toBe(503);
  });

  it("flujo completo: configurar, probar, ver bandeja, responder como humano y resolver", async () => {
    const { request, json, login } = setup();
    const cookie = await login();
    const auth = { headers: { cookie } };

    const settings = (await (await request("/admin/api/settings", auth)).json()) as {
      profile: Record<string, unknown>;
      configuredProviders: string[];
    };
    expect(settings.profile.name).toBe("Tacos Ana");
    expect(settings.configuredProviders).toContain("fake");

    const put = await request("/admin/api/settings", {
      ...json({ profile: { ...settings.profile, hours: "L-S 9-20", tone: "divertido" } }, cookie),
      method: "PUT",
    });
    expect(((await put.json()) as { profile: { hours: string } }).profile.hours).toBe("L-S 9-20");

    const bad = await request("/admin/api/settings", {
      ...json({ profile: { name: "" } }, cookie),
      method: "PUT",
    });
    expect(bad.status).toBe(400);

    const pg = await request(
      "/admin/api/playground",
      json({ sessionId: "s1", text: "Quiero hablar con una persona" }, cookie),
    );
    const pgBody = (await pg.json()) as { handoff: boolean; conversationId: string };
    expect(pgBody.handoff).toBe(true);

    const list = (await (
      await request("/admin/api/conversations?filter=needs_human", auth)
    ).json()) as {
      conversations: Array<{ id: string; needsHuman: boolean }>;
    };
    expect(list.conversations).toHaveLength(1);
    const id = list.conversations[0]?.id as string;

    const reply = await request(
      `/admin/api/conversations/${id}/reply`,
      json({ text: "Hola, te atiendo yo" }, cookie),
    );
    expect(((await reply.json()) as { delivered: boolean }).delivered).toBe(true);

    await request(
      `/admin/api/conversations/${id}/note`,
      json({ text: "cliente frecuente" }, cookie),
    );
    const detail = (await (await request(`/admin/api/conversations/${id}`, auth)).json()) as {
      messages: Array<{ role: string }>;
      needsHuman: boolean;
      pausedUntil: number | null;
    };
    expect(detail.messages.map((m) => m.role)).toEqual(["user", "assistant", "human", "note"]);
    expect(detail.needsHuman).toBe(false);
    expect(detail.pausedUntil).toBeGreaterThan(Date.now());

    const resumed = await request(`/admin/api/conversations/${id}/resume`, json({}, cookie));
    expect(resumed.status).toBe(200);

    const tickets = (await (await request("/admin/api/tickets", auth)).json()) as {
      tickets: Array<{ id: string }>;
    };
    expect(tickets.tickets).toHaveLength(1);
    const resolve = await request(
      `/admin/api/tickets/${tickets.tickets[0]?.id}/resolve`,
      json({}, cookie),
    );
    expect(resolve.status).toBe(200);

    const summary = (await (await request("/admin/api/summary", auth)).json()) as {
      openTickets: number;
    };
    expect(summary.openTickets).toBe(0);
  });

  it("gestiona leads", async () => {
    const { request, json, login } = setup();
    await request(
      "/api/web/chat",
      json({ visitorId: "visitante-999", text: "Cotízame, mi tel es +56 9 1234 5678" }),
    );
    const cookie = await login();
    const { leads } = (await (
      await request("/admin/api/leads", { headers: { cookie } })
    ).json()) as {
      leads: Array<{ id: string; phone: string }>;
    };
    expect(leads[0]?.phone).toBe("+56 9 1234 5678");
    const patched = await request(`/admin/api/leads/${leads[0]?.id}`, {
      ...json({ status: "ganado", notes: "cerró por WhatsApp" }, cookie),
      method: "PATCH",
    });
    expect(((await patched.json()) as { lead: { status: string } }).lead.status).toBe("ganado");
  });
});
