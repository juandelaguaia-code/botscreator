import Anthropic from "@anthropic-ai/sdk";
import type { ModelTier } from "@yunque/core";
import {
  type GenerateRequest,
  type GenerateResponse,
  LlmError,
  type LlmMessage,
  type LlmPart,
  type LlmProvider,
  type StopReason,
  textOf,
} from "../types.js";

export const ANTHROPIC_DEFAULT_MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-5-5",
  smart: "claude-sonnet-5-5",
  max: "claude-opus-5-5",
};

/** Esfuerzo por nivel: las respuestas de chat no necesitan razonamiento profundo. */
const EFFORT: Record<ModelTier, "low" | "medium"> = {
  fast: "low",
  smart: "medium",
  max: "medium",
};

/** Modelos que aceptan `fallbacks` del lado del servidor ante un rechazo por política. */
const SUPPORTS_SERVER_FALLBACK = new Set([
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5",
  "claude-fable-5-2",
  "claude-fable-5-1",
]);

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AnthropicProviderOptions {
  apiKey: string;
  models?: Partial<Record<ModelTier, string>>;
  /** Inyectable para tests. */
  client?: Anthropic;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;
  private readonly models: Record<ModelTier, string>;

  constructor(opts: AnthropicProviderOptions) {
    this.client =
      opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });
    this.models = { ...ANTHROPIC_DEFAULT_MODELS, ...stripEmpty(opts.models) };
  }

  modelFor(tier: ModelTier): string {
    return this.models[tier];
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const model = this.modelFor(req.tier);
    const useFallback = SUPPORTS_SERVER_FALLBACK.has(model);

    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: req.system.stable, cache_control: { type: "ephemeral" } },
    ];
    if (req.system.volatile) system.push({ type: "text", text: req.system.volatile });

    try {
      const response = await this.client.beta.messages.create({
        model,
        max_tokens: req.maxTokens ?? 16_000,
        system,
        messages: toAnthropicMessages(req.messages),
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: { ...t.inputSchema, additionalProperties: false },
                strict: true,
              })),
            }
          : {}),
        output_config: {
          effort: EFFORT[req.tier],
          ...(req.responseFormat
            ? {
                format: {
                  type: "json_schema" as const,
                  schema: { ...req.responseFormat.schema, additionalProperties: false },
                },
              }
            : {}),
        },
        ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      });

      const content = fromAnthropicContent(response.content);
      return {
        content,
        text: textOf(content),
        toolCalls: content.filter(
          (p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call",
        ),
        stopReason: mapStopReason(response.stop_reason),
        model: response.model,
        provider: this.id,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      throw toLlmError(error);
    }
  }
}

export function toAnthropicMessages(messages: LlmMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const p of m.content) {
      switch (p.type) {
        case "text":
          if (p.text) blocks.push({ type: "text", text: p.text });
          break;
        case "image":
          blocks.push({
            type: "image",
            source: { type: "base64", media_type: p.mediaType, data: p.data },
          });
          break;
        case "tool_call":
          blocks.push({ type: "tool_use", id: p.id, name: p.name, input: p.input });
          break;
        case "tool_result":
          blocks.push({
            type: "tool_result",
            tool_use_id: p.toolCallId,
            content: p.content,
            ...(p.isError ? { is_error: true } : {}),
          });
          break;
        case "provider_raw":
          if (p.provider === "anthropic")
            blocks.push(p.block as Anthropic.Beta.BetaContentBlockParam);
          break;
      }
    }
    if (blocks.length > 0) out.push({ role: m.role, content: blocks });
  }
  return out;
}

function fromAnthropicContent(blocks: Anthropic.Beta.BetaContentBlock[]): LlmPart[] {
  const parts: LlmPart[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "tool_use")
      parts.push({
        type: "tool_call",
        id: b.id,
        name: b.name,
        input: (b.input ?? {}) as Record<string, unknown>,
      });
    // razonamiento y otros bloques: se devuelven intactos dentro del mismo turno
    else parts.push({ type: "provider_raw", provider: "anthropic", block: b });
  }
  return parts;
}

function mapStopReason(reason: Anthropic.Beta.BetaStopReason | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function toLlmError(error: unknown): LlmError {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new LlmError(
      "Llave de Anthropic inválida o sin permisos",
      "auth",
      "anthropic",
      error.status,
    );
  if (error instanceof Anthropic.RateLimitError)
    return new LlmError(
      "Límite de uso de Anthropic alcanzado",
      "rate_limit",
      "anthropic",
      error.status,
    );
  if (error instanceof Anthropic.BadRequestError)
    return new LlmError(
      `Solicitud rechazada por Anthropic: ${error.message}`,
      "bad_request",
      "anthropic",
      error.status,
    );
  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  )
    return new LlmError("Anthropic no está disponible", "unavailable", "anthropic");
  if (error instanceof Anthropic.APIError)
    return new LlmError(
      `Error de Anthropic: ${error.message}`,
      "unknown",
      "anthropic",
      error.status,
    );
  return new LlmError(
    error instanceof Error ? error.message : String(error),
    "unknown",
    "anthropic",
  );
}

function stripEmpty<T extends Record<string, string | undefined>>(
  obj: Partial<T> | undefined,
): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => typeof v === "string" && v.length > 0),
  ) as Partial<T>;
}
