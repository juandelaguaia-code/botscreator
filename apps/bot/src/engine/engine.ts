import {
  type BotSettings,
  type BusinessProfile,
  buildSystemPrompt,
  type Channel,
  chooseModelTier,
  extractButtons,
  isExplicitHumanRequest,
  renderBusinessInfo,
  systemMessage,
  TOOL_NAMES,
} from "@yunque/core";
import {
  costUsd,
  type GenerateResponse,
  type ImageMediaType,
  LlmError,
  type LlmMessage,
  type LlmPart,
  type LlmProvider,
  runToolLoop,
} from "@yunque/llm";
import type { KnowledgeBase, SearchHit } from "../knowledge/service.js";
import type { ContactRecord, ConversationRecord, MessageRecord, Store } from "../store/types.js";
import { BUILTIN_TOOLS, buildToolHandlers, SEARCH_TOOL } from "./tools.js";
import { verifyReply } from "./verifier.js";

const TEN_MINUTES = 10 * 60 * 1000;
/** Pausa "hasta reactivar": una fecha lejana en vez de un valor especial. */
export const PAUSE_FOREVER = 253_402_300_799_000;

export interface InboundMessage {
  channel: Channel;
  /** Identificador del cliente en el canal (chat id de Telegram, visitante web…). */
  externalUserId: string;
  userName?: string;
  text: string;
  images?: Array<{ mediaType: ImageMediaType; data: string }>;
}

export type SkipReason = "empty" | "disabled" | "paused" | "rate_limited";

export interface BlockedReply {
  draft: string;
  unsupported: string[];
}

export interface EngineResult {
  conversationId: string;
  contact: ContactRecord;
  /** Texto para mandar al cliente; `null` si el bot no debe responder. */
  reply: string | null;
  /** Opciones tocables (cada canal las dibuja a su modo). */
  buttons: string[];
  handoff: boolean;
  skipped?: SkipReason;
  model?: string;
  /** El Blindaje frenó la respuesta original. */
  blocked: BlockedReply | null;
  /** Pasajes de la base de conocimiento usados en el turno. */
  passages: Array<{ title: string; score: number }>;
}

export interface HandoffEvent {
  reason: string;
  contact: ContactRecord;
  conversation: ConversationRecord;
}

export interface EngineDeps {
  store: Store;
  /** Construye el proveedor según la configuración vigente (puede fallar si falta la llave). */
  providerFor: (settings: BotSettings) => LlmProvider;
  loadConfig: () => Promise<{ profile: BusinessProfile; settings: BotSettings }>;
  /** Base de conocimiento (opcional): pasajes por turno, búsqueda y radar de huecos. */
  knowledge?: KnowledgeBase;
  /** Aviso al dueño (Telegram, correo…). Los errores se registran y no cortan la respuesta. */
  notify?: (event: HandoffEvent) => Promise<void>;
  now?: () => number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

interface TurnContext {
  contact: ContactRecord;
  conversation: ConversationRecord;
  profile: BusinessProfile;
  settings: BotSettings;
  input: InboundMessage;
  text: string;
}

export class ConversationEngine {
  private readonly now: () => number;
  private readonly log: (message: string, data?: Record<string, unknown>) => void;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? ((message, data) => console.log(JSON.stringify({ message, ...data })));
  }

  async handleInbound(input: InboundMessage): Promise<EngineResult> {
    const { store } = this.deps;
    const text = input.text.trim();
    const contact = await store.upsertContact({
      channel: input.channel,
      externalId: input.externalUserId,
      ...(input.userName ? { name: input.userName } : {}),
    });
    const conversation =
      (await store.findOpenConversation(contact.id, input.channel)) ??
      (await store.createConversation({ contactId: contact.id, channel: input.channel }));

    const base = {
      conversationId: conversation.id,
      contact,
      buttons: [],
      blocked: null,
      passages: [],
    };
    if (!text && !input.images?.length)
      return { ...base, reply: null, handoff: false, skipped: "empty" };

    const now = this.now();
    await store.addMessage({
      conversationId: conversation.id,
      role: "user",
      content: text || "[imagen]",
      meta: input.images?.length ? { images: input.images.length } : null,
    });
    await store.updateConversation(conversation.id, {
      lastMessageAt: now,
      lastCustomerMessageAt: now,
      lastMessagePreview: preview(text || "📷 Imagen"),
      unread: conversation.unread + 1,
    });

    const { profile, settings } = await this.deps.loadConfig();

    if (!settings.enabled) return { ...base, reply: null, handoff: false, skipped: "disabled" };
    if (conversation.pausedUntil && conversation.pausedUntil > now) {
      return { ...base, reply: null, handoff: false, skipped: "paused" };
    }
    const recent = await store.countCustomerMessages(conversation.id, now - TEN_MINUTES);
    if (recent > settings.rateLimitPer10Min) {
      return { ...base, reply: null, handoff: false, skipped: "rate_limited" };
    }

    // "Quiero hablar con una persona": no hace falta gastar IA para entenderlo.
    if (text && isExplicitHumanRequest(text)) {
      await this.escalate({
        contact,
        conversation,
        reason: "El cliente pidió hablar con una persona",
      });
      const reply = systemMessage(profile.language, "handoffAck");
      await this.saveAssistant(conversation.id, reply, { kind: "handoff_ack" });
      return { ...base, reply, handoff: true };
    }

    return this.answerWithAi({ contact, conversation, profile, settings, input, text });
  }

  /** Respuesta de una persona del equipo desde el panel: el bot se aparta `takeoverMinutes`. */
  async humanReply(
    conversationId: string,
    text: string,
  ): Promise<{ message: MessageRecord; conversation: ConversationRecord }> {
    const { store } = this.deps;
    const conversation = await store.getConversation(conversationId);
    if (!conversation) throw new Error("Conversación no encontrada");
    const { settings } = await this.deps.loadConfig();
    const now = this.now();
    const message = await store.addMessage({
      conversationId,
      role: "human",
      content: text,
      meta: { author: "admin" },
    });
    const pausedUntil = Math.max(
      conversation.pausedUntil ?? 0,
      now + settings.takeoverMinutes * 60_000,
    );
    await store.updateConversation(conversationId, {
      pausedUntil,
      needsHuman: false,
      unread: 0,
      lastMessageAt: now,
      lastMessagePreview: preview(text),
    });
    return { message, conversation: { ...conversation, pausedUntil } };
  }

  private async answerWithAi(turn: TurnContext): Promise<EngineResult> {
    const { store, knowledge } = this.deps;
    const { contact, conversation, profile, settings, input, text } = turn;
    const base = { conversationId: conversation.id, contact };
    let handoff = false;
    const responses: GenerateResponse[] = [];

    try {
      const provider = this.deps.providerFor(settings);
      const history = await store.listMessages(conversation.id, settings.historyLimit);
      const customerTurns = await store.countCustomerMessages(conversation.id);
      const tier = chooseModelTier(settings.modelMode, {
        text,
        multiStepFlow: false,
        hasImage: Boolean(input.images?.length),
        customerTurns,
      });

      // Blindaje · busca antes de afirmar: pasajes relevantes para este mensaje.
      const kbReady = knowledge ? await this.safely(() => knowledge.hasDocuments(), false) : false;
      const searchOptions = { topK: settings.kbTopK, minScore: settings.kbMinScore };
      let passages: SearchHit[] = [];
      if (knowledge && kbReady && text) {
        const query = retrievalQuery(history, text);
        passages = await this.safely(
          async () => (await knowledge.search(query, searchOptions)).passing,
          [],
        );
      }

      const prompt = buildSystemPrompt({
        profile,
        channel: input.channel,
        now: new Date(this.now()),
        knowledgeBase: kbReady,
        passages,
        buttons: settings.buttonsEnabled,
      });

      const recordGap = async (question: string, source: "kb_miss" | "handoff" | "verifier") => {
        if (!knowledge) return;
        await this.safely(
          () => knowledge.recordGap({ question, source, conversationId: conversation.id }),
          undefined,
        );
      };

      const result = await runToolLoop({
        provider,
        request: {
          system: { stable: prompt.stable, volatile: prompt.volatile },
          messages: toLlmHistory(history, input.images),
          tools: kbReady ? [...BUILTIN_TOOLS, SEARCH_TOOL] : BUILTIN_TOOLS,
          tier,
        },
        handlers: buildToolHandlers({
          store,
          contact,
          conversation,
          onHandoff: async (reason) => {
            handoff = true;
            await this.escalate({ contact, conversation, reason });
          },
          onMissingInfo: (info) => recordGap(info, "handoff"),
          ...(knowledge && kbReady
            ? {
                search: async (query: string) => {
                  const found = await knowledge.search(query, searchOptions);
                  if (found.passing.length === 0) await recordGap(query, "kb_miss");
                  return found;
                },
              }
            : {}),
        }),
      });
      responses.push(...result.responses);

      const usedPassages = passages.map((p) => ({ title: p.title, score: round2(p.score) }));
      const finish = (
        reply: string,
        extra: Partial<EngineResult> & { meta?: Record<string, unknown> },
      ) =>
        this.finish(conversation.id, responses, {
          ...base,
          reply,
          buttons: extra.buttons ?? [],
          handoff: extra.handoff ?? handoff,
          model: result.final.model,
          blocked: extra.blocked ?? null,
          passages: usedPassages,
          meta: {
            model: result.final.model,
            tier,
            tools: result.toolCalls.map((c) => c.name),
            ...extra.meta,
          },
        });

      if (result.final.stopReason === "refusal") {
        await this.escalate({
          contact,
          conversation,
          reason: "El modelo declinó responder este mensaje",
        });
        return finish(systemMessage(profile.language, "handoffAck"), {
          handoff: true,
          meta: { kind: "refusal" },
        });
      }

      if (!result.text) {
        return finish(
          systemMessage(profile.language, handoff ? "handoffAck" : "errorFallback"),
          {},
        );
      }

      const { text: draft, buttons: rawButtons } = extractButtons(result.text);
      const buttons = settings.buttonsEnabled ? rawButtons : [];

      // Blindaje · verifica antes de enviar.
      if (settings.verifierEnabled) {
        const source = buildVerificationSource({
          profile,
          passages,
          toolOutputs: result.toolCalls
            .filter((c) => c.name === TOOL_NAMES.searchKnowledge)
            .map((c) => c.result.content),
          history,
          volatile: prompt.volatile,
        });
        const verdict = await this.safely(
          () => verifyReply({ provider, reply: [draft, ...buttons].join("\n"), source }),
          null,
        );
        if (verdict?.response) responses.push(verdict.response);
        if (verdict && !verdict.ok) {
          const blocked = { draft, unsupported: verdict.unsupported };
          await this.escalate({
            contact,
            conversation,
            reason: `Blindaje: el bot iba a afirmar algo sin respaldo (${verdict.unsupported.join("; ")})`,
          });
          await recordGap(text || draft, "verifier");
          return finish(systemMessage(profile.language, "confirmWithTeam"), {
            handoff: true,
            blocked,
            meta: { blocked },
          });
        }
      }

      return finish(draft, { buttons, meta: buttons.length ? { buttons } : {} });
    } catch (error) {
      const detail =
        error instanceof LlmError
          ? `${error.provider}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
      this.log("engine.ai_error", { conversationId: conversation.id, detail });
      await store.createTicket({
        conversationId: conversation.id,
        kind: "system",
        reason: `Falla de IA — ${detail}`,
      });
      await this.escalate({
        contact,
        conversation,
        reason: "El bot no pudo responder (falla técnica)",
      });
      const reply = systemMessage(profile.language, "errorFallback");
      await this.recordUsage(conversation.id, responses);
      await this.saveAssistant(conversation.id, reply, { kind: "error" });
      return { ...base, reply, buttons: [], handoff: true, blocked: null, passages: [] };
    }
  }

  private async finish(
    conversationId: string,
    responses: GenerateResponse[],
    result: EngineResult & { reply: string; meta: Record<string, unknown> },
  ): Promise<EngineResult> {
    const { meta, ...rest } = result;
    await this.recordUsage(conversationId, responses);
    await this.saveAssistant(conversationId, rest.reply, {
      ...meta,
      ...(rest.passages.length ? { passages: rest.passages } : {}),
    });
    return rest;
  }

  private async recordUsage(conversationId: string, responses: GenerateResponse[]): Promise<void> {
    await Promise.all(
      responses.map((r) =>
        this.deps.store.recordUsage({
          conversationId,
          provider: r.provider,
          model: r.model,
          ...r.usage,
          costUsd: costUsd(r.model, r.usage),
        }),
      ),
    );
  }

  /** Ejecuta algo accesorio (búsqueda, verificación, radar) sin que su falla tumbe la respuesta. */
  private async safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.log("engine.optional_step_failed", {
        detail: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
  }

  private async escalate(args: {
    contact: ContactRecord;
    conversation: ConversationRecord;
    reason: string;
  }): Promise<void> {
    const { store } = this.deps;
    await store.updateConversation(args.conversation.id, { needsHuman: true });
    const existing = await store.findOpenTicket(args.conversation.id, "handoff");
    if (existing) return; // ya hay alguien avisado: no spamear al dueño
    await store.createTicket({
      conversationId: args.conversation.id,
      kind: "handoff",
      reason: args.reason,
    });
    if (this.deps.notify) {
      try {
        await this.deps.notify({
          reason: args.reason,
          contact: args.contact,
          conversation: args.conversation,
        });
      } catch (error) {
        this.log("engine.notify_error", {
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async saveAssistant(
    conversationId: string,
    text: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.deps.store.addMessage({ conversationId, role: "assistant", content: text, meta });
    await this.deps.store.updateConversation(conversationId, {
      lastMessageAt: this.now(),
      lastMessagePreview: preview(text),
    });
  }
}

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 137)}…` : oneLine;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Consulta para la base de conocimiento: el último mensaje, y si es muy corto ("¿y cuánto
 * cuesta?"), también el anterior del cliente para no perder el tema.
 */
export function retrievalQuery(history: MessageRecord[], text: string): string {
  if (text.split(/\s+/).length >= 4) return text;
  const userMessages = history.filter((m) => m.role === "user").map((m) => m.content);
  const previous = userMessages.at(-2);
  return previous ? `${previous}\n${text}` : text;
}

/** Todo lo que el bot podía afirmar en este turno: es contra lo que se verifica. */
export function buildVerificationSource(args: {
  profile: BusinessProfile;
  passages: SearchHit[];
  toolOutputs: string[];
  history: MessageRecord[];
  volatile: string;
}): string {
  const customer = args.history
    .filter((m) => m.role === "user" || m.role === "human")
    .slice(-10)
    .map((m) => `${m.role === "user" ? "Cliente" : "Equipo"}: ${m.content}`);
  return [
    renderBusinessInfo(args.profile),
    args.profile.instructions ? `Instrucciones del dueño:\n${args.profile.instructions}` : "",
    ...args.passages.map((p) => p.text),
    ...args.toolOutputs,
    customer.length ? `Lo que se dijo en la conversación:\n${customer.join("\n")}` : "",
    args.volatile,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const HUMAN_PREFIX = "[Respuesta de una persona del equipo] ";

/**
 * Convierte el historial guardado al formato del modelo. Las respuestas del equipo humano van
 * como turnos del asistente marcados, para que el bot sepa qué se dijo y no lo contradiga.
 */
export function toLlmHistory(
  history: MessageRecord[],
  images?: Array<{ mediaType: ImageMediaType; data: string }>,
): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const m of history) {
    if (m.role === "note") continue;
    const role = m.role === "user" ? "user" : "assistant";
    const text = m.role === "human" ? HUMAN_PREFIX + m.content : m.content;
    const last = out.at(-1);
    if (last && last.role === role) last.content.push({ type: "text", text: `\n${text}` });
    else out.push({ role, content: [{ type: "text", text }] });
  }
  while (out[0] && out[0].role !== "user") out.shift();

  const lastUser = [...out].reverse().find((m) => m.role === "user");
  if (lastUser && images?.length) {
    const parts: LlmPart[] = images.map((img) => ({
      type: "image",
      mediaType: img.mediaType,
      data: img.data,
    }));
    lastUser.content.unshift(...parts);
  }
  return out;
}
