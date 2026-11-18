import { defaultBotSettings, systemMessage } from "@yunque/core";
import { FakeProvider, type GenerateRequest, type LlmPart } from "@yunque/llm";
import { describe, expect, it, vi } from "vitest";
import { localClock, runAutomation } from "../src/automation/runner.js";
import type { ChannelSender } from "../src/channels/types.js";
import { SETTINGS_KEYS } from "../src/engine/config.js";
import type { Env } from "../src/env.js";
import { createServices, type Services } from "../src/services.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

const MIN = 60_000;
const HOUR = 60 * MIN;

const INSIGHT = {
  rating: 4,
  sentiment: "positivo",
  resolved_without_human: true,
  open_sale: false,
  upset: false,
  intent: "cotizar balatas",
  objection: "",
  unanswered_question: "",
  summary: "Pidió precio de balatas y quedó conforme.",
  customer_memory: "Tiene una Hilux 2019.",
};

const say = (text: string): LlmPart[] => [{ type: "text", text }];

function script(insight: Record<string, unknown> = INSIGHT) {
  return (req: GenerateRequest): LlmPart[] => {
    if (req.responseFormat?.name === "analisis_conversacion") return say(JSON.stringify(insight));
    if (req.responseFormat) return say(JSON.stringify({ supported: true, unsupported: [] }));
    if (req.system.stable.includes("mensajes de seguimiento"))
      return say("¿Te aparto las balatas para mañana?");
    return say("Claro, con gusto.");
  };
}

interface Setup {
  services: Services;
  db: D1Database;
  sent: Array<{ channel: string; to: string; text: string; template?: unknown }>;
  notices: Array<{ title: string; body: string }>;
  provider: FakeProvider;
}

async function setup(
  settings: Record<string, unknown> = {},
  profile: Record<string, unknown> = {},
  insight?: Record<string, unknown>,
): Promise<Setup> {
  const db = createTestD1();
  const env = { DB: db, LLM_PROVIDER: "fake", BOT_NAME: "Taller Fierro" } as Env;
  const base = createServices(env);
  const provider = new FakeProvider(script(insight));
  const sent: Setup["sent"] = [];
  const sender = (channel: "telegram" | "whatsapp"): ChannelSender => ({
    channel,
    send: vi.fn(async (to, message) => {
      sent.push({ channel, to, text: message.text, template: message.template });
    }),
  });
  const notices: Setup["notices"] = [];
  const services: Services = {
    ...base,
    providerFor: () => provider,
    senders: { telegram: sender("telegram"), whatsapp: sender("whatsapp") },
    notifier: { channels: ["telegram"], notify: vi.fn(async (n) => void notices.push(n)) },
  };
  await base.store.setSetting(SETTINGS_KEYS.settings, {
    ...defaultBotSettings(),
    provider: "fake",
    ...settings,
  });
  await base.store.setSetting(SETTINGS_KEYS.profile, {
    name: "Taller Fierro",
    timezone: "UTC",
    ...profile,
  });
  return { services, db, sent, notices, provider };
}

let seq = 0;
/** Crea un contacto + conversación con mensajes en el pasado (minutos atrás). */
async function seed(
  db: D1Database,
  opts: {
    channel?: string;
    messages: Array<[role: string, minutesAgo: number, text?: string]>;
    pausedUntil?: number;
    needsHuman?: boolean;
    lead?: boolean;
  },
) {
  const n = ++seq;
  const now = Date.now();
  const channel = opts.channel ?? "whatsapp";
  const contact = `ct_${n}`;
  const conv = `cv_${n}`;
  const userTimes = opts.messages.filter(([r]) => r === "user").map(([, m]) => now - m * MIN);
  const lastAt = Math.max(...opts.messages.map(([, m]) => now - m * MIN));
  const statements = [
    db
      .prepare(
        "INSERT INTO contacts (id, channel, external_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(contact, channel, `52155${n}`, `Cliente ${n}`, now - 30 * 86_400_000, now),
    db
      .prepare(
        `INSERT INTO conversations (id, contact_id, channel, status, needs_human, paused_until, last_message_at,
           last_customer_message_at, created_at) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      )
      .bind(
        conv,
        contact,
        channel,
        opts.needsHuman ? 1 : 0,
        opts.pausedUntil ?? null,
        lastAt,
        Math.max(...userTimes),
        now - 30 * 86_400_000,
      ),
    ...opts.messages.map(([role, m, text], i) =>
      db
        .prepare(
          "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(`m_${n}_${i}`, conv, role, text ?? `${role} ${i}`, now - m * MIN),
    ),
  ];
  if (opts.lead) {
    statements.push(
      db
        .prepare(
          "INSERT INTO leads (id, contact_id, conversation_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(`ld_${n}`, contact, conv, `Cliente ${n}`, now - 5 * 86_400_000, now),
    );
  }
  await db.batch(statements);
  return { contact, conv, externalId: `52155${n}` };
}

describe("Vigilante", () => {
  it("cierra tras 3 h de silencio, califica, guarda memoria y no avisa si todo salió bien", async () => {
    const { services, db, notices } = await setup();
    const { conv, contact } = await seed(db, {
      messages: [
        ["user", 240],
        ["assistant", 239],
      ],
    });
    await seed(db, {
      messages: [
        ["user", 30],
        ["assistant", 29],
      ],
    }); // reciente: sigue abierta

    const report = await runAutomation(services);
    expect(report).toMatchObject({ closed: 1, analyzed: 1, alerts: 0 });
    expect((await services.store.getConversation(conv))?.status).toBe("closed");
    expect(await services.automation.getInsight(conv)).toMatchObject({
      rating: 4,
      sentiment: "positivo",
    });
    expect(await services.automation.getContactMemory(contact)).toBe("Tiene una Hilux 2019.");
    expect(notices).toHaveLength(0);
  });

  it("avisa cuando un cliente terminó molesto y registra la pregunta sin respuesta en el radar", async () => {
    const { services, db, notices } = await setup(
      {},
      {},
      {
        ...INSIGHT,
        rating: 2,
        sentiment: "negativo",
        upset: true,
        unanswered_question: "¿Hacen alineación?",
      },
    );
    await seed(db, {
      messages: [
        ["user", 300],
        ["assistant", 299],
      ],
    });
    const report = await runAutomation(services);
    expect(report.alerts).toBe(1);
    expect(notices[0]?.title).toContain("molesto");
    expect((await services.knowledge.listGaps("open", 30))[0]?.question).toBe("¿Hacen alineación?");
  });

  it("la memoria del cliente entra al prompt de su siguiente conversación", async () => {
    const { services, db, provider } = await setup();
    const { externalId } = await seed(db, {
      channel: "telegram",
      messages: [
        ["user", 400],
        ["assistant", 399],
      ],
    });
    await runAutomation(services);
    const engineProvider = new FakeProvider(() => say("¡Hola de nuevo!"));
    const engine = new (await import("../src/engine/engine.js")).ConversationEngine({
      store: services.store,
      automation: services.automation,
      providerFor: () => engineProvider,
      loadConfig: services.config,
      log: () => {},
    });
    await engine.handleInbound({
      channel: "telegram",
      externalUserId: externalId,
      text: "hola otra vez",
    });
    expect(engineProvider.calls[0]?.system.volatile).toContain("Tiene una Hilux 2019.");
    expect(provider.calls.length).toBeGreaterThan(0);
  });
});

describe("Cazador de ventas", () => {
  const warm = (minutesAgo: number): Array<[string, number]> => [
    ["user", minutesAgo + 30],
    ["assistant", minutesAgo + 29],
    ["user", minutesAgo + 20],
    ["assistant", minutesAgo + 19],
    ["user", minutesAgo + 10],
    ["assistant", minutesAgo + 9],
    ["user", minutesAgo],
    ["assistant", minutesAgo - 1],
  ];

  it("manda un solo toque dentro de la ventana de 3 a 20 h, y nunca dos veces", async () => {
    const { services, db, sent } = await setup({
      automation: { ...defaultBotSettings().automation, vigilante: false },
    });
    const { conv } = await seed(db, { messages: warm(5 * 60) });
    const first = await runAutomation(services);
    expect(first.hunted).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe("¿Te aparto las balatas para mañana?");
    const msgs = await services.store.listMessages(conv, 20);
    expect(msgs.at(-1)?.meta).toMatchObject({ kind: "cazador" });
    expect((await services.store.getConversation(conv))?.status).toBe("open");

    const second = await runAutomation(services);
    expect(second.hunted).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("respeta la ventana, la pausa, el pedido de humano y que el cliente no haya hablado último", async () => {
    const { services, db, sent } = await setup({
      automation: { ...defaultBotSettings().automation, vigilante: false },
    });
    await seed(db, { messages: warm(60) }); // muy pronto (1 h)
    await seed(db, { messages: warm(22 * 60) }); // tarde (22 h)
    await seed(db, { messages: warm(5 * 60), pausedUntil: Date.now() + HOUR });
    await seed(db, { messages: warm(5 * 60), needsHuman: true });
    await seed(db, { messages: [...warm(6 * 60), ["user", 5 * 60]] }); // el cliente habló último
    await seed(db, {
      messages: [
        ["user", 300],
        ["assistant", 299],
      ],
    }); // poca actividad y sin venta abierta
    await seed(db, { channel: "web", messages: warm(5 * 60) }); // el chat web no permite escribir primero
    const report = await runAutomation(services);
    expect(report.hunted).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("no pasa del tope diario", async () => {
    const { services, db, sent } = await setup({
      automation: { ...defaultBotSettings().automation, vigilante: false, hunterDailyMax: 1 },
    });
    await seed(db, { messages: warm(5 * 60) });
    await seed(db, { messages: warm(6 * 60) });
    await runAutomation(services);
    await runAutomation(services);
    expect(sent).toHaveLength(1);
  });
});

describe("Encuestas y reseñas", () => {
  it("encuesta al cerrar; un 5 agradece e invita a reseña una sola vez", async () => {
    const { services, db, sent } = await setup(
      { automation: { ...defaultBotSettings().automation, surveys: true, hunter: false } },
      { reviewUrl: "https://g.page/r/taller-fierro/review" },
    );
    const { externalId } = await seed(db, {
      channel: "telegram",
      messages: [
        ["user", 300],
        ["assistant", 299],
      ],
    });
    const report = await runAutomation(services);
    expect(report.surveys).toBe(1);
    expect(sent[0]?.text).toBe(systemMessage("es-419", "surveyQuestion"));

    const answer = await services.engine.handleInbound({
      channel: "telegram",
      externalUserId: externalId,
      text: "5",
    });
    expect(answer.reply).toContain("https://g.page/r/taller-fierro/review");
    // otra respuesta ya no cuenta como encuesta ni repite la invitación
    const again = await services.engine.handleInbound({
      channel: "telegram",
      externalUserId: externalId,
      text: "5",
    });
    expect(again.reply).not.toContain("g.page");
  });

  it("una calificación baja pasa la conversación al equipo", async () => {
    const { services, db } = await setup({
      automation: { ...defaultBotSettings().automation, surveys: true, hunter: false },
    });
    const { externalId } = await seed(db, {
      channel: "telegram",
      messages: [
        ["user", 300],
        ["assistant", 299],
      ],
    });
    await runAutomation(services);
    const answer = await services.engine.handleInbound({
      channel: "telegram",
      externalUserId: externalId,
      text: "1",
    });
    expect(answer.reply).toBe(systemMessage("es-419", "surveyLow"));
    expect(answer.handoff).toBe(true);
    expect((await services.store.listTickets("open", 5))[0]?.reason).toContain("1/5");
  });

  it("sin encuestas, invita a reseña a quien quedó contento según el Vigilante", async () => {
    const { services, db, sent } = await setup(
      { automation: { ...defaultBotSettings().automation, hunter: false } },
      { reviewUrl: "https://g.page/r/x/review" },
    );
    await seed(db, {
      channel: "telegram",
      messages: [
        ["user", 300],
        ["assistant", 299],
      ],
    });
    const report = await runAutomation(services);
    expect(report.reviews).toBe(1);
    expect(sent[0]?.text).toContain("https://g.page/r/x/review");
  });
});

describe("Recupera no-shows", () => {
  it("retoma a leads enfriados hace días; en WhatsApp solo con plantilla aprobada", async () => {
    const auto = {
      ...defaultBotSettings().automation,
      vigilante: false,
      hunter: false,
      noShows: true,
    };
    const { services, db, sent } = await setup({ automation: auto });
    await seed(db, {
      channel: "telegram",
      lead: true,
      messages: [
        ["user", 3 * 1440],
        ["assistant", 3 * 1440 - 1],
      ],
    });
    await seed(db, {
      channel: "whatsapp",
      lead: true,
      messages: [
        ["user", 3 * 1440],
        ["assistant", 3 * 1440 - 1],
      ],
    });
    const report = await runAutomation(services);
    expect(report.noShows).toBe(1);
    expect(sent.map((s) => s.channel)).toEqual(["telegram"]);

    const withTemplate = await setup({
      automation: auto,
      whatsappTemplates: { noShow: { name: "retomar_contacto", language: "es_MX" } },
    });
    await seed(withTemplate.db, {
      channel: "whatsapp",
      lead: true,
      messages: [
        ["user", 3 * 1440],
        ["assistant", 3 * 1440 - 1],
      ],
    });
    await runAutomation(withTemplate.services);
    expect(withTemplate.sent[0]?.template).toMatchObject({ name: "retomar_contacto" });
  });
});

describe("Reporte nocturno, watchdog y tope de gasto", () => {
  it("manda el resumen una vez al día a partir de la hora configurada", async () => {
    const hour = localClock(Date.now(), "UTC").hour;
    const { services, notices } = await setup({
      automation: { ...defaultBotSettings().automation, dailyReportHour: hour },
    });
    expect((await runAutomation(services)).dailyReport).toBe(true);
    expect(notices[0]?.title).toContain("Tu día");
    expect((await runAutomation(services)).dailyReport).toBe(false);
  });

  it("alerta tras 3 fallas de IA en 30 minutos, con freno de 6 horas", async () => {
    const { services, notices } = await setup({
      automation: { ...defaultBotSettings().automation, dailyReport: false },
    });
    for (let i = 0; i < 3; i++) {
      await services.store.createTicket({
        conversationId: null,
        kind: "system",
        reason: "Falla de IA — sin saldo",
      });
    }
    expect((await runAutomation(services)).watchdog).toBe(true);
    expect((await runAutomation(services)).watchdog).toBe(false);
    expect(notices.filter((n) => n.title.includes("fallando"))).toHaveLength(1);
  });

  it("con el tope de gasto alcanzado no usa IA y pasa la conversación al equipo", async () => {
    const { services } = await setup({ monthlyBudgetUsd: 1 });
    await services.store.recordUsage({
      conversationId: null,
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 1.5,
    });
    const result = await services.engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-x",
      text: "hola",
    });
    expect(result.reply).toBe(systemMessage("es-419", "budgetReached"));
    expect(result.handoff).toBe(true);
  });
});
