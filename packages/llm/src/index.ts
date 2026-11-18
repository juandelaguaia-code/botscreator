import type { ModelTier, ProviderId } from "@yunque/core";
import { AnthropicProvider } from "./providers/anthropic.js";
import { FakeProvider } from "./providers/fake.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";
import { LlmError, type LlmProvider } from "./types.js";

export { costUsd } from "./pricing.js";
export {
  ANTHROPIC_DEFAULT_MODELS,
  AnthropicProvider,
  toAnthropicMessages,
} from "./providers/anthropic.js";
export { FakeProvider, type FakeScript } from "./providers/fake.js";
export {
  COMPATIBLE_PROVIDERS,
  OpenAICompatibleProvider,
  toOpenAIMessages,
} from "./providers/openai-compatible.js";
export * from "./tool-loop.js";
export * from "./types.js";

export interface ProviderKeys {
  anthropic?: string;
  openai?: string;
  xai?: string;
  gemini?: string;
}

/** Proveedores con llave disponible (`fake` siempre lo está). */
export function availableProviders(keys: ProviderKeys): ProviderId[] {
  const ids: ProviderId[] = [];
  if (keys.anthropic) ids.push("anthropic");
  if (keys.openai) ids.push("openai");
  if (keys.xai) ids.push("xai");
  if (keys.gemini) ids.push("gemini");
  return ids;
}

export function createProvider(
  id: ProviderId,
  keys: ProviderKeys,
  models?: Partial<Record<ModelTier, string>>,
): LlmProvider {
  if (id === "fake") return new FakeProvider();
  const apiKey = keys[id];
  if (!apiKey) throw new LlmError(`Falta la llave del proveedor "${id}"`, "auth", id);
  if (id === "anthropic") return new AnthropicProvider({ apiKey, ...(models ? { models } : {}) });
  return new OpenAICompatibleProvider({ provider: id, apiKey, ...(models ? { models } : {}) });
}
