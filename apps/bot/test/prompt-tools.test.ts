import { businessProfileSchema, defaultBotSettings, systemMessage } from "@yunque/core";
import { FakeProvider } from "@yunque/llm";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ConversationEngine } from "../src/engine/engine.js";
import type { Env } from "../src/env.js";
import { D1Store } from "../src/store/d1.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

function setup() {
  const env = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "clave",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Barbería",
  } as Env;
  const app = createApp();
  let cookie = "";
  const request = (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } },
      env,
    );
  const login = async () => {
    const res = await request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "clave" }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] as string;
  };
  return { env, request, login };
}

describe("modo espejo", () => {
  it("los mensajes del sistema salen en el idioma del cliente", async () => {
    const store = new D1Store(createTestD1());
    const engine = new ConversationEngine({
      store,
      providerFor: () => new FakeProvider(),
      loadConfig: async () => ({
        profile: businessProfileSchema.parse({ name: "Spa", language: "espejo" }),
        settings: { ...defaultBotSettings(), provider: "fake" },
      }),
      log: () => {},
    });
    const en = await engine.handleInbound({
      channel: "web",
      externalUserId: "web_a",
      text: "I want to talk to a human please",
    });
    expect(en.reply).toBe(systemMessage("en", "handoffAck"));
    const pt = await engine.handleInbound({
      channel: "web",
      externalUserId: "web_b",
      text: "quero falar com um atendente",
    });
    expect(pt.reply).toBe(systemMessage("pt-BR", "handoffAck"));
  });
});

describe("versiones del prompt", () => {
  it("cada guardado deja la versión anterior y se puede restaurar", async () => {
    const { request, login } = setup();
    await login();
    const current = (await (await request("/admin/api/settings")).json()) as {
      profile: Record<string, unknown>;
    };
    await request("/admin/api/settings", {
      method: "PUT",
      body: JSON.stringify({ profile: { ...current.profile, instructions: "Versión A" } }),
    });
    await request("/admin/api/settings", {
      method: "PUT",
      body: JSON.stringify({ profile: { ...current.profile, instructions: "Versión B" } }),
    });
    await request("/admin/api/prompt/versions", {
      method: "POST",
      body: JSON.stringify({ label: "Lista para producción" }),
    });

    const { versions } = (await (await request("/admin/api/prompt/versions")).json()) as {
      versions: Array<{ id: string; label: string; preview: { instructionsChars: number } }>;
    };
    expect(versions.map((v) => v.label)).toEqual(["Lista para producción", "Antes de guardar"]);
    const versionA = versions.find((v) => v.label === "Antes de guardar");

    const restored = await request(`/admin/api/prompt/versions/${versionA?.id}/restore`, {
      method: "POST",
    });
    expect(
      ((await restored.json()) as { profile: { instructions: string } }).profile.instructions,
    ).toBe("Versión A");
    const after = (await (await request("/admin/api/prompt/versions")).json()) as {
      versions: Array<{ label: string }>;
    };
    expect(after.versions[0]?.label).toBe("Antes de restaurar");
  });
});

describe("giros", () => {
  it("aplica un giro sin pisar lo que el dueño escribió y devuelve las preguntas pendientes", async () => {
    const { request, login } = setup();
    await login();
    const { giros } = (await (await request("/admin/api/giros")).json()) as {
      giros: Array<{ id: string }>;
    };
    expect(giros).toHaveLength(15);

    const res = await request("/admin/api/giro/apply", {
      method: "POST",
      body: JSON.stringify({ giro: "barberia" }),
    });
    const body = (await res.json()) as {
      profile: { giro: string; offerings: Array<{ name: string; price?: string }> };
      pendingQuestions: string[];
    };
    expect(body.profile.giro).toBe("barberia");
    expect(body.profile.offerings.map((o) => o.name)).toContain("Corte de cabello");
    expect(body.profile.offerings.every((o) => !o.price)).toBe(true);
    expect(body.pendingQuestions).toContain("¿Atienden sin cita?");

    const prompt = (await (await request("/admin/api/prompt")).json()) as {
      sections: Array<{ id: string }>;
    };
    expect(prompt.sections.map((s) => s.id)).toContain("giro");

    // re-nichar no reemplaza servicios ya cargados
    const again = await request("/admin/api/giro/apply", {
      method: "POST",
      body: JSON.stringify({ giro: "spa" }),
    });
    const second = (await again.json()) as { profile: { offerings: Array<{ name: string }> } };
    expect(second.profile.offerings.map((o) => o.name)).toContain("Corte de cabello");
  });
});
