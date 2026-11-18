import type { BotSettings } from "@yunque/core";
import {
  availableProviders,
  createProvider,
  type LlmProvider,
  type ProviderKeys,
} from "@yunque/llm";
import { AutomationStore } from "./automation/store.js";
import { type Transcriber, WorkersAiTranscriber } from "./channels/media.js";
import { type ChannelSenders, createSenders } from "./channels/registry.js";
import { loadConfig } from "./engine/config.js";
import { ConversationEngine } from "./engine/engine.js";
import type { Env } from "./env.js";
import { type Embedder, HashEmbedder, WorkersAiEmbedder } from "./knowledge/embedder.js";
import { KnowledgeService } from "./knowledge/service.js";
import { KnowledgeStore } from "./knowledge/store.js";
import { D1VectorIndex, type VectorIndex, VectorizeIndex } from "./knowledge/vector-index.js";
import { createNotifier, type Notifier } from "./notify.js";
import { D1Store } from "./store/d1.js";
import type { Store } from "./store/types.js";

export function providerKeys(env: Env): ProviderKeys {
  return {
    ...(env.ANTHROPIC_API_KEY ? { anthropic: env.ANTHROPIC_API_KEY } : {}),
    ...(env.OPENAI_API_KEY ? { openai: env.OPENAI_API_KEY } : {}),
    ...(env.XAI_API_KEY ? { xai: env.XAI_API_KEY } : {}),
    ...(env.GEMINI_API_KEY ? { gemini: env.GEMINI_API_KEY } : {}),
  };
}

export function configuredProviders(env: Env): string[] {
  const ids: string[] = availableProviders(providerKeys(env));
  if (env.LLM_PROVIDER === "fake") ids.push("fake");
  return ids;
}

export interface Services {
  env: Env;
  store: Store;
  engine: ConversationEngine;
  knowledge: KnowledgeService;
  automation: AutomationStore;
  config: () => ReturnType<typeof loadConfig>;
  providerFor: (settings: BotSettings) => LlmProvider;
  senders: ChannelSenders;
  notifier: Notifier;
  /** Oído: transcripción de notas de voz (null sin Workers AI). */
  transcriber: Transcriber | null;
}

/**
 * Producción: bge-m3 en Workers AI + Vectorize. Sin esos bindings (desarrollo local, tests) se usa
 * un embedder léxico y un índice en D1, con el mismo flujo.
 */
export function createKnowledge(env: Env): KnowledgeService {
  const embedder: Embedder = env.AI ? new WorkersAiEmbedder(env.AI) : new HashEmbedder();
  const index: VectorIndex =
    env.AI && env.VECTORIZE
      ? new VectorizeIndex(env.VECTORIZE)
      : new D1VectorIndex(env.DB, embedder.id);
  return new KnowledgeService(new KnowledgeStore(env.DB), embedder, index);
}

/** Arma las dependencias de producción a partir de los bindings del Worker. */
export function createServices(env: Env): Services {
  const store = new D1Store(env.DB);
  const config = () => loadConfig(store, { botName: env.BOT_NAME, provider: env.LLM_PROVIDER });
  const keys = providerKeys(env);
  const providerFor = (settings: BotSettings) =>
    createProvider(settings.provider, keys, settings.models);
  const knowledge = createKnowledge(env);
  const notifier = createNotifier(env);
  const automation = new AutomationStore(env.DB);

  const engine = new ConversationEngine({
    store,
    knowledge,
    automation,
    loadConfig: config,
    providerFor,
    notify: async (event) => {
      const who = event.contact.name ?? event.contact.externalId;
      await notifier.notify({
        title: "🙋 Te necesitan en una conversación",
        body: `Motivo: ${event.reason}\nCliente: ${who} (${event.conversation.channel})`,
        path: `/admin/bandeja/${event.conversation.id}`,
      });
    },
  });

  return {
    env,
    store,
    engine,
    knowledge,
    automation,
    config,
    providerFor,
    senders: createSenders(env),
    notifier,
    transcriber: env.AI ? new WorkersAiTranscriber(env.AI) : null,
  };
}
