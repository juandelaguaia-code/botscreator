import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import { createKnowledge } from "../src/services.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

function setup() {
  const env = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "clave",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Spa Luna",
  } as Env;
  const app = createApp();
  let cookie = "";
  const request = (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      { ...init, headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) } },
      env,
    );
  const send = (method: string, path: string, body?: unknown) =>
    request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const login = async () => {
    const res = await send("POST", "/admin/api/login", { password: "clave" });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
  };
  return { env, request, send, login };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API de base de conocimiento", () => {
  it("exige sesión", async () => {
    const { request } = setup();
    expect((await request("/admin/api/kb")).status).toBe(401);
    expect((await request("/admin/api/export/leads.csv")).status).toBe(401);
  });

  it("crea, busca, edita y borra documentos", async () => {
    const { request, send, login } = setup();
    await login();

    const created = await send("POST", "/admin/api/kb/documents", {
      title: "Políticas",
      content: "Estacionamiento gratuito para clientes en el sótano.\n\nNo se aceptan mascotas.",
    });
    expect(created.status).toBe(201);
    const { document } = (await created.json()) as {
      document: { id: string; chunkCount: number; status: string };
    };
    expect(document).toMatchObject({ status: "ready" });

    const list = (await (await request("/admin/api/kb")).json()) as {
      engine: { index: string };
      documents: unknown[];
    };
    expect(list.engine.index).toBe("d1");
    expect(list.documents).toHaveLength(1);

    const search = (await (
      await send("POST", "/admin/api/kb/search", { query: "¿hay estacionamiento para clientes?" })
    ).json()) as {
      minScore: number;
      results: Array<{ passes: boolean; text: string }>;
    };
    expect(search.results[0]?.passes).toBe(true);

    const updated = await send("PUT", `/admin/api/kb/documents/${document.id}`, {
      title: "Políticas 2026",
      content: "Solo efectivo.",
    });
    expect(updated.status).toBe(200);
    const detail = (await (await request(`/admin/api/kb/documents/${document.id}`)).json()) as {
      content: string;
      title: string;
    };
    expect(detail).toMatchObject({ title: "Políticas 2026", content: "Solo efectivo." });

    expect((await send("POST", "/admin/api/kb/reindex")).status).toBe(200);
    expect((await send("DELETE", `/admin/api/kb/documents/${document.id}`)).status).toBe(200);
    expect((await send("DELETE", `/admin/api/kb/documents/${document.id}`)).status).toBe(404);
  });

  it("valida la entrada", async () => {
    const { send, login } = setup();
    await login();
    expect(
      (await send("POST", "/admin/api/kb/documents", { title: "", content: "x" })).status,
    ).toBe(400);
    expect(
      (await send("POST", "/admin/api/kb/import-url", { url: "ftp://ejemplo.com" })).status,
    ).toBe(400);
  });

  it("importa el texto de una página web", async () => {
    const { send, login } = setup();
    await login();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            `<html><head><title>Spa Luna · Servicios</title></head><body><nav>menú</nav><h1>Servicios</h1>
           <p>Masaje relajante de 60 minutos con aceites esenciales. Reserva con 24 horas de anticipación.</p></body></html>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          ),
      ),
    );
    const res = await send("POST", "/admin/api/kb/import-url", {
      url: "https://spaluna.example/servicios",
    });
    expect(res.status).toBe(201);
    const { document } = (await res.json()) as {
      document: { title: string; source: string; sourceUrl: string };
    };
    expect(document).toMatchObject({
      title: "Spa Luna · Servicios",
      source: "url",
      sourceUrl: "https://spaluna.example/servicios",
    });
  });

  it("informa si la página no se puede importar", async () => {
    const { send, login } = setup();
    await login();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 404 })),
    );
    expect(
      (await send("POST", "/admin/api/kb/import-url", { url: "https://x.example" })).status,
    ).toBe(422);
  });
});

describe("radar de huecos", () => {
  it("lista huecos, los resuelve agregando la respuesta a las FAQ y los ignora", async () => {
    const { env, request, send, login } = setup();
    await login();
    const knowledge = createKnowledge(env);
    await knowledge.recordGap({
      question: "¿Tienen sauna?",
      source: "kb_miss",
      conversationId: null,
    });
    await knowledge.recordGap({
      question: "¿Aceptan perros grandes?",
      source: "verifier",
      conversationId: null,
    });

    const { gaps } = (await (await request("/admin/api/gaps")).json()) as {
      gaps: Array<{ id: string; question: string; hits: number }>;
    };
    expect(gaps.map((g) => g.question).sort()).toEqual([
      "¿Aceptan perros grandes?",
      "¿Tienen sauna?",
    ]);

    const sauna = gaps.find((g) => g.question === "¿Tienen sauna?");
    const perros = gaps.find((g) => g.question !== "¿Tienen sauna?");
    expect(
      (
        await send("POST", `/admin/api/gaps/${sauna?.id}/resolve`, {
          answer: "Sí, incluido en el paquete premium.",
        })
      ).status,
    ).toBe(200);
    expect((await send("POST", `/admin/api/gaps/${perros?.id}/ignore`)).status).toBe(200);
    expect((await send("POST", `/admin/api/gaps/${sauna?.id}/resolve`, {})).status).toBe(404);

    const settings = (await (await request("/admin/api/settings")).json()) as {
      profile: { faq: Array<{ question: string; answer: string }> };
    };
    expect(settings.profile.faq).toEqual([
      { question: "¿Tienen sauna?", answer: "Sí, incluido en el paquete premium." },
    ]);

    const open = (await (await request("/admin/api/gaps?status=open")).json()) as {
      gaps: unknown[];
    };
    expect(open.gaps).toEqual([]);
    const resolved = (await (await request("/admin/api/gaps?status=resolved")).json()) as {
      gaps: Array<{ resolution: string }>;
    };
    expect(resolved.gaps[0]?.resolution).toBe("Sí, incluido en el paquete premium.");
  });
});

describe("exportar", () => {
  it("descarga leads y conversaciones en CSV y JSON", async () => {
    const { request, send, login } = setup();
    await send("POST", "/api/web/chat", {
      visitorId: "visitante-exp",
      text: "Hola, soy Ana, ana@correo.com",
    });
    await login();

    const csv = await request("/admin/api/export/leads.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain("attachment");
    const bytes = new Uint8Array(await csv.arrayBuffer());
    // BOM UTF-8 para que Excel lea bien los acentos (Response.text() lo descarta al decodificar)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csvText = new TextDecoder().decode(bytes);
    expect(csvText).toContain("nombre,telefono,correo");
    expect(csvText).toContain("ana@correo.com");

    const leads = (await (await request("/admin/api/export/leads.json")).json()) as Array<{
      email: string;
    }>;
    expect(leads[0]?.email).toBe("ana@correo.com");

    const conversations = (await (
      await request("/admin/api/export/conversations.json")
    ).json()) as Array<{
      channel: string;
      messages: Array<{ role: string }>;
    }>;
    expect(conversations[0]?.channel).toBe("web");
    expect(conversations[0]?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

    const messages = await (await request("/admin/api/export/messages.csv")).text();
    expect(messages).toContain("conversacion,canal,cliente");
  });
});

describe("vista del prompt", () => {
  it("devuelve las secciones con los frenos primero y bloqueados", async () => {
    const { request, login } = setup();
    expect((await request("/admin/api/prompt")).status).toBe(401);
    await login();
    const preview = (await (await request("/admin/api/prompt?channel=telegram")).json()) as {
      channel: string;
      sections: Array<{ id: string; locked: boolean; text: string }>;
      volatile: string;
      totalChars: number;
    };
    expect(preview.channel).toBe("telegram");
    expect(preview.sections[0]).toMatchObject({ id: "guardrails", locked: true });
    expect(preview.sections.find((s) => s.id === "business")?.locked).toBe(false);
    expect(preview.sections.find((s) => s.id === "channel")?.text).toContain("Telegram");
    expect(preview.volatile).toContain("Fecha y hora");
    expect(preview.totalChars).toBeGreaterThan(500);
  });
});
