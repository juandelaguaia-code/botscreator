import {
  type BotSettings,
  businessProfileSchema,
  defaultBotSettings,
  systemMessage,
} from "@yunque/core";
import { FakeProvider, type GenerateRequest, type LlmPart } from "@yunque/llm";
import { describe, expect, it, vi } from "vitest";
import { ConversationEngine } from "../src/engine/engine.js";
import { HashEmbedder } from "../src/knowledge/embedder.js";
import { KnowledgeService } from "../src/knowledge/service.js";
import { KnowledgeStore } from "../src/knowledge/store.js";
import { D1VectorIndex } from "../src/knowledge/vector-index.js";
import { D1Store } from "../src/store/d1.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

const POLICIES = `Cancelaciones: puedes cancelar o cambiar tu cita sin costo avisando con 24 horas de anticipación.

Estacionamiento: tenemos estacionamiento gratuito para clientes en el sótano del edificio.

Mascotas: no se permiten mascotas dentro del spa, salvo perros de asistencia.`;

function setupKnowledge() {
  const db = createTestD1();
  const embedder = new HashEmbedder();
  const knowledge = new KnowledgeService(
    new KnowledgeStore(db),
    embedder,
    new D1VectorIndex(db, embedder.id),
  );
  return { db, knowledge };
}

const SEARCH = { topK: 5, minScore: null };

describe("KnowledgeService", () => {
  it("indexa un documento y encuentra el pasaje relevante por encima del umbral", async () => {
    const { knowledge } = setupKnowledge();
    const doc = await knowledge.addDocument({
      title: "Políticas del spa",
      content: POLICIES,
      source: "manual",
    });
    expect(doc.status).toBe("ready");
    expect(doc.chunkCount).toBeGreaterThan(0);
    expect(await knowledge.hasDocuments()).toBe(true);

    const found = await knowledge.search("¿Tienen estacionamiento para clientes?", SEARCH);
    expect(found.passing.length).toBeGreaterThan(0);
    expect(found.passing[0]?.text).toContain("Estacionamiento");
    expect(found.minScore).toBe(new HashEmbedder().recommendedMinScore);

    const unrelated = await knowledge.search("¿Venden bicicletas eléctricas?", SEARCH);
    expect(unrelated.passing).toHaveLength(0);
  });

  it("al borrar un documento desaparecen sus pasajes", async () => {
    const { knowledge } = setupKnowledge();
    const doc = await knowledge.addDocument({
      title: "Políticas",
      content: POLICIES,
      source: "manual",
    });
    expect(await knowledge.removeDocument(doc.id)).toBe(true);
    expect(await knowledge.hasDocuments()).toBe(false);
    expect((await knowledge.search("estacionamiento", SEARCH)).hits).toHaveLength(0);
  });

  it("al editar reemplaza los trozos anteriores", async () => {
    const { knowledge } = setupKnowledge();
    const doc = await knowledge.addDocument({
      title: "Políticas",
      content: POLICIES,
      source: "manual",
    });
    await knowledge.updateDocument(
      doc.id,
      "Políticas",
      "Horario de verano: abrimos domingos de 10 a 14.",
    );
    expect(
      (await knowledge.search("estacionamiento gratuito clientes", SEARCH)).passing,
    ).toHaveLength(0);
    expect(
      (await knowledge.search("¿abren los domingos en verano?", SEARCH)).passing.length,
    ).toBeGreaterThan(0);
  });

  it("agrupa dudas repetidas en el radar en vez de duplicarlas", async () => {
    const { knowledge } = setupKnowledge();
    await knowledge.recordGap({
      question: "¿Aceptan pago con bitcoin?",
      source: "kb_miss",
      conversationId: null,
    });
    await knowledge.recordGap({
      question: "aceptan pago con BITCOIN",
      source: "kb_miss",
      conversationId: null,
    });
    await knowledge.recordGap({
      question: "¿Aceptan pagos con bitcoin aquí?",
      source: "verifier",
      conversationId: null,
    });
    await knowledge.recordGap({
      question: "¿Tienen sauna?",
      source: "handoff",
      conversationId: null,
    });
    const gaps = await knowledge.listGaps("open", 30);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]?.hits).toBe(3);
    await knowledge.closeGap(gaps[0]?.id ?? "", "resolved", "Sí, con transferencia");
    expect(await knowledge.listGaps("open", 30)).toHaveLength(1);
  });

  it("marca el documento con error si el embedder falla, sin romper", async () => {
    const db = createTestD1();
    const failing = {
      id: "roto",
      recommendedMinScore: 0.7,
      embed: async () => Promise.reject(new Error("sin red")),
    };
    const knowledge = new KnowledgeService(
      new KnowledgeStore(db),
      failing,
      new D1VectorIndex(db, "roto"),
    );
    const doc = await knowledge.addDocument({
      title: "x",
      content: "algo de texto",
      source: "manual",
    });
    expect(doc.status).toBe("error");
    expect(doc.error).toContain("sin red");
  });
});

// ---------- motor con conocimiento, verificador y botones ----------

const profile = businessProfileSchema.parse({
  name: "Spa Luna",
  offerings: [{ name: "Masaje relajante", price: "800", durationMinutes: 60 }],
});

async function setupEngine(
  script: ConstructorParameters<typeof FakeProvider>[0],
  settings: Partial<BotSettings> = {},
) {
  const db = createTestD1();
  const store = new D1Store(db);
  const embedder = new HashEmbedder();
  const knowledge = new KnowledgeService(
    new KnowledgeStore(db),
    embedder,
    new D1VectorIndex(db, embedder.id),
  );
  const provider = new FakeProvider(script);
  const engine = new ConversationEngine({
    store,
    knowledge,
    providerFor: () => provider,
    loadConfig: async () => ({
      profile,
      settings: { ...defaultBotSettings(), provider: "fake", ...settings },
    }),
    notify: vi.fn(async () => {}),
    log: () => {},
  });
  return { store, knowledge, provider, engine };
}

const msg = (text: string) => ({ channel: "web" as const, externalUserId: "visitante-kb", text });
const say = (text: string): LlmPart[] => [{ type: "text", text }];
const lastUser = (req: GenerateRequest) =>
  req.messages
    .at(-1)
    ?.content.map((p) => (p.type === "text" ? p.text : ""))
    .join("") ?? "";

describe("motor + base de conocimiento", () => {
  it("inyecta los pasajes relevantes en el turno y ofrece la herramienta de búsqueda", async () => {
    const { knowledge, provider, engine } = await setupEngine(() =>
      say("Sí, el estacionamiento es gratuito."),
    );
    await knowledge.addDocument({ title: "Políticas", content: POLICIES, source: "manual" });

    const result = await engine.handleInbound(msg("¿Tienen estacionamiento para clientes?"));
    const call = provider.calls[0];
    expect(call?.system.volatile).toContain("estacionamiento gratuito");
    expect(call?.tools?.map((t) => t.name)).toContain("buscar_conocimiento");
    expect(result.passages.length).toBeGreaterThan(0);
  });

  it("sin documentos no ofrece la búsqueda", async () => {
    const { provider, engine } = await setupEngine(() => say("Hola"));
    await engine.handleInbound(msg("hola"));
    expect(provider.calls[0]?.tools?.map((t) => t.name)).not.toContain("buscar_conocimiento");
  });

  it("una búsqueda sin resultados va al radar de huecos", async () => {
    const { knowledge, engine } = await setupEngine((_req, i) =>
      i === 0
        ? [
            {
              type: "tool_call",
              id: "s1",
              name: "buscar_conocimiento",
              input: { query: "¿aceptan bitcoin?" },
            },
          ]
        : say("Déjame confirmarlo con el equipo."),
    );
    await knowledge.addDocument({ title: "Políticas", content: POLICIES, source: "manual" });
    await engine.handleInbound(msg("¿Puedo pagar con bitcoin?"));
    const gaps = await knowledge.listGaps("open", 30);
    expect(gaps.map((g) => g.source)).toEqual(["kb_miss"]);
  });

  it("el dato faltante de pedir_humano también va al radar", async () => {
    const { knowledge, store, engine } = await setupEngine((_req, i) =>
      i === 0
        ? [
            {
              type: "tool_call",
              id: "h1",
              name: "pedir_humano",
              input: { reason: "No sé el precio", missing_info: "precio del masaje con piedras" },
            },
          ]
        : say("Ya le aviso al equipo."),
    );
    const r = await engine.handleInbound(msg("¿Cuánto cuesta el masaje con piedras?"));
    expect(r.handoff).toBe(true);
    expect((await knowledge.listGaps("open", 30))[0]?.question).toBe(
      "precio del masaje con piedras",
    );
    expect((await store.listTickets("open", 5))[0]?.reason).toContain(
      "falta: precio del masaje con piedras",
    );
  });
});

describe("Blindaje · verificador pre-envío", () => {
  it("frena una respuesta con datos inventados, avisa y registra el hueco", async () => {
    const { store, knowledge, engine, provider } = await setupEngine((req) =>
      req.responseFormat
        ? say(
            JSON.stringify({ supported: false, unsupported: ["precio $650", "15% de descuento"] }),
          )
        : say("El masaje te queda en $650 con 15% de descuento."),
    );
    const r = await engine.handleInbound(msg("¿Cuánto cuesta el masaje?"));
    expect(r.reply).toBe(systemMessage("es-419", "confirmWithTeam"));
    expect(r.blocked?.draft).toContain("$650");
    expect(r.handoff).toBe(true);
    expect(provider.calls.at(-1)?.responseFormat?.name).toBe("veredicto");
    expect((await knowledge.listGaps("open", 30))[0]?.source).toBe("verifier");
    expect((await store.listTickets("open", 5))[0]?.reason).toContain("Blindaje");

    const messages = await store.listMessages(r.conversationId, 5);
    expect(messages.at(-1)?.meta?.blocked).toBeTruthy();
  });

  it("deja pasar sin gastar verificación si las cifras están en la fuente", async () => {
    const { engine, provider } = await setupEngine(() =>
      say("El masaje relajante cuesta $800 y dura 60 min."),
    );
    const r = await engine.handleInbound(msg("¿Cuánto cuesta el masaje?"));
    expect(r.reply).toContain("$800");
    expect(r.blocked).toBeNull();
    expect(provider.calls).toHaveLength(1);
  });

  it("respeta el veredicto del modelo cuando la cifra sí está respaldada", async () => {
    const { engine, provider } = await setupEngine((req) =>
      req.responseFormat
        ? say(JSON.stringify({ supported: true, unsupported: [] }))
        : say(`Para ${lastUser(req).includes("2") ? "2" : "dos"} personas serían $1,600.`),
    );
    const r = await engine.handleInbound(msg("¿Cuánto sería el masaje para 2 personas?"));
    expect(r.reply).toContain("$1,600");
    expect(provider.calls).toHaveLength(2);
  });

  it("con el verificador apagado no se revisa nada", async () => {
    const { engine, provider } = await setupEngine(() => say("Te queda en $10."), {
      verifierEnabled: false,
    });
    const r = await engine.handleInbound(msg("precio?"));
    expect(r.reply).toBe("Te queda en $10.");
    expect(provider.calls).toHaveLength(1);
  });
});

describe("botones tocables", () => {
  const withButtons = () => say("¿Te aparto el jueves a las 5?\n[[opciones: Sí | No]]");

  it("los separa del texto cuando están activados", async () => {
    const { engine, store } = await setupEngine(withButtons, {
      buttonsEnabled: true,
      verifierEnabled: false,
    });
    const r = await engine.handleInbound(msg("quiero una cita"));
    expect(r.reply).toBe("¿Te aparto el jueves a las 5?");
    expect(r.buttons).toEqual(["Sí", "No"]);
    expect((await store.listMessages(r.conversationId, 5)).at(-1)?.meta?.buttons).toEqual([
      "Sí",
      "No",
    ]);
  });

  it("si están apagados limpia el marcador y no manda botones", async () => {
    const { engine } = await setupEngine(withButtons, { verifierEnabled: false });
    const r = await engine.handleInbound(msg("quiero una cita"));
    expect(r.reply).toBe("¿Te aparto el jueves a las 5?");
    expect(r.buttons).toEqual([]);
  });
});
