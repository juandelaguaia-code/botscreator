import {
  type BotSettings,
  businessProfileSchema,
  defaultBotSettings,
  systemMessage,
} from "@yunque/core";
import { FakeProvider, LlmError, type LlmProvider } from "@yunque/llm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationEngine, type EngineDeps, toLlmHistory } from "../src/engine/engine.js";
import { D1Store } from "../src/store/d1.js";
import type { MessageRecord } from "../src/store/types.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

const profile = businessProfileSchema.parse({ name: "Barbería Don José", language: "es-419" });

function setup(overrides: { settings?: Partial<BotSettings>; provider?: LlmProvider } = {}) {
  let clock = Date.UTC(2026, 10, 17, 15, 0, 0);
  const now = () => clock;
  const store = new D1Store(createTestD1(), now);
  const provider = overrides.provider ?? new FakeProvider();
  const notify = vi.fn(async () => {});
  const settings: BotSettings = {
    ...defaultBotSettings(),
    provider: "fake",
    ...overrides.settings,
  };
  const deps: EngineDeps = {
    store,
    providerFor: () => provider,
    loadConfig: async () => ({ profile, settings }),
    notify,
    now,
    log: () => {},
  };
  const engine = new ConversationEngine(deps);
  const advance = (ms: number) => {
    clock += ms;
  };
  return { store, engine, provider, notify, advance, now };
}

const msg = (text: string, externalUserId = "visitante-1") => ({
  channel: "web" as const,
  externalUserId,
  text,
});

describe("ConversationEngine", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("responde y guarda el hilo, la vista previa y el uso", async () => {
    const result = await ctx.engine.handleInbound(msg("¿A qué hora abren?"));
    expect(result.reply).toContain("Recibí");
    expect(result.handoff).toBe(false);

    const messages = await ctx.store.listMessages(result.conversationId, 10);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const conv = await ctx.store.getConversation(result.conversationId);
    expect(conv?.unread).toBe(1);
    expect(conv?.lastMessagePreview).toBe(result.reply);
    const summary = await ctx.store.summary(ctx.now());
    expect(summary.conversations24h).toBe(1);
    expect(summary.messages24h).toBe(2);
  });

  it("reutiliza la conversación abierta del mismo cliente", async () => {
    const a = await ctx.engine.handleInbound(msg("hola"));
    const b = await ctx.engine.handleInbound(msg("otra pregunta"));
    expect(b.conversationId).toBe(a.conversationId);
    const c = await ctx.engine.handleInbound(msg("hola", "otro-visitante"));
    expect(c.conversationId).not.toBe(a.conversationId);
  });

  it("captura el lead con la herramienta y actualiza el contacto", async () => {
    const result = await ctx.engine.handleInbound(
      msg("Quiero reservar, mi correo es ana@example.com"),
    );
    expect(result.reply).toContain("registrado");
    const leads = await ctx.store.listLeads(10);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ email: "ana@example.com", channel: "web", status: "nuevo" });
    const contact = await ctx.store.getContact(result.contact.id);
    expect(contact?.email).toBe("ana@example.com");
  });

  it("pasa a humano sin gastar IA cuando lo piden explícitamente, una sola vez", async () => {
    const provider = ctx.provider as FakeProvider;
    const first = await ctx.engine.handleInbound(msg("Quiero hablar con una persona"));
    expect(first.handoff).toBe(true);
    expect(first.reply).toBe(systemMessage("es-419", "handoffAck"));
    expect(provider.calls).toHaveLength(0);
    expect(ctx.notify).toHaveBeenCalledTimes(1);

    await ctx.engine.handleInbound(msg("hola? necesito un asesor"));
    expect(ctx.notify).toHaveBeenCalledTimes(1);
    const tickets = await ctx.store.listTickets("open", 10);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.kind).toBe("handoff");
    const conv = await ctx.store.getConversation(first.conversationId);
    expect(conv?.needsHuman).toBe(true);
  });

  it("escala cuando el modelo usa la herramienta pedir_humano", async () => {
    const result = await ctx.engine.handleInbound(msg("Tengo una queja, el corte quedó mal"));
    expect(result.handoff).toBe(true);
    const tickets = await ctx.store.listTickets("open", 10);
    expect(tickets[0]?.reason).toBe("queja del cliente");
  });

  it("se aparta mientras un humano tiene la conversación y retoma al vencer", async () => {
    const first = await ctx.engine.handleInbound(msg("hola"));
    await ctx.engine.humanReply(first.conversationId, "Hola, soy Santi del equipo");

    const provider = ctx.provider as FakeProvider;
    const callsBefore = provider.calls.length;
    const paused = await ctx.engine.handleInbound(msg("gracias Santi"));
    expect(paused.skipped).toBe("paused");
    expect(paused.reply).toBeNull();
    expect(provider.calls.length).toBe(callsBefore);

    ctx.advance(61 * 60_000);
    const resumed = await ctx.engine.handleInbound(msg("¿siguen ahí?"));
    expect(resumed.reply).not.toBeNull();
    // el bot ve lo que dijo el humano, marcado como tal
    const lastCall = provider.calls.at(-1);
    const history = JSON.stringify(lastCall?.messages);
    expect(history).toContain("[Respuesta de una persona del equipo] Hola, soy Santi");
  });

  it("no responde con el bot apagado", async () => {
    const off = setup({ settings: { enabled: false } });
    const result = await off.engine.handleInbound(msg("hola"));
    expect(result.skipped).toBe("disabled");
    expect((await off.store.listMessages(result.conversationId, 10)).map((m) => m.role)).toEqual([
      "user",
    ]);
  });

  it("frena el abuso por ráfaga de mensajes", async () => {
    const limited = setup({ settings: { rateLimitPer10Min: 5 } });
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(await limited.engine.handleInbound(msg(`mensaje ${i}`)));
    expect(results.at(-1)?.skipped).toBe("rate_limited");
    expect(results.at(-2)?.skipped).toBeUndefined();
  });

  it("ante una falla de la IA responde con disculpa, abre ticket de sistema y avisa", async () => {
    const failing: LlmProvider = {
      id: "anthropic",
      modelFor: () => "claude-haiku-5-5",
      generate: async () => {
        throw new LlmError("Llave inválida", "auth", "anthropic", 401);
      },
    };
    const broken = setup({ provider: failing });
    const result = await broken.engine.handleInbound(msg("hola"));
    expect(result.reply).toBe(systemMessage("es-419", "errorFallback"));
    const kinds = (await broken.store.listTickets("open", 10)).map((t) => t.kind).sort();
    expect(kinds).toEqual(["handoff", "system"]);
    expect(broken.notify).toHaveBeenCalledTimes(1);
  });

  it("si el modelo declina, pasa a humano con un acuse amable", async () => {
    const refusing: LlmProvider = {
      id: "anthropic",
      modelFor: () => "claude-sonnet-5-5",
      generate: async () => ({
        content: [],
        text: "",
        toolCalls: [],
        stopReason: "refusal",
        model: "claude-sonnet-5-5",
        provider: "anthropic",
        usage: { inputTokens: 10, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    };
    const r = await setup({ provider: refusing }).engine.handleInbound(msg("hola"));
    expect(r.handoff).toBe(true);
    expect(r.reply).toBe(systemMessage("es-419", "handoffAck"));
  });
});

describe("toLlmHistory", () => {
  const m = (role: MessageRecord["role"], content: string): MessageRecord => ({
    id: content,
    conversationId: "c",
    role,
    content,
    meta: null,
    createdAt: 0,
  });

  it("omite notas, une turnos seguidos y empieza siempre por el cliente", () => {
    const out = toLlmHistory([
      m("assistant", "saludo previo"),
      m("user", "hola"),
      m("user", "¿están?"),
      m("note", "nota interna"),
      m("human", "Sí, aquí estoy"),
    ]);
    expect(out.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(out[0]?.content).toHaveLength(2);
    expect(JSON.stringify(out)).not.toContain("nota interna");
  });

  it("adjunta las imágenes al último mensaje del cliente", () => {
    const out = toLlmHistory([m("user", "mira esto")], [{ mediaType: "image/png", data: "AAA" }]);
    expect(out[0]?.content[0]).toMatchObject({ type: "image", mediaType: "image/png" });
  });
});
