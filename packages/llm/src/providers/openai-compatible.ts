import type { ModelTier, ProviderId } from "@yunque/core";
import OpenAI from "openai";
import {
  type GenerateRequest,
  type GenerateResponse,
  LlmError,
  type LlmMessage,
  type LlmPart,
  type LlmProvider,
  type StopReason,
} from "../types.js";

type CompatibleId = Extract<ProviderId, "openai" | "xai" | "gemini">;

interface CompatibleConfig {
  baseURL?: string;
  models: Record<ModelTier, string>;
  label: string;
}

/** Defaults de referencia; el dueño los cambia por bot desde Configuración. */
export const COMPATIBLE_PROVIDERS: Record<CompatibleId, CompatibleConfig> = {
  openai: {
    label: "OpenAI",
    models: { fast: "gpt-4.1-mini", smart: "gpt-4.1", max: "gpt-4.1" },
  },
  xai: {
    label: "xAI",
    baseURL: "https://api.x.ai/v1",
    models: { fast: "grok-4-fast", smart: "grok-4", max: "grok-4" },
  },
  gemini: {
    label: "Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: { fast: "gemini-2.5-flash", smart: "gemini-2.5-flash", max: "gemini-2.5-pro" },
  },
};

export interface OpenAICompatibleOptions {
  provider: CompatibleId;
  apiKey: string;
  models?: Partial<Record<ModelTier, string>>;
  client?: OpenAI;
}

/** Adaptador para proveedores con API de Chat Completions compatible con OpenAI. */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly id: CompatibleId;
  private readonly client: OpenAI;
  private readonly models: Record<ModelTier, string>;
  private readonly label: string;

  constructor(opts: OpenAICompatibleOptions) {
    const cfg = COMPATIBLE_PROVIDERS[opts.provider];
    this.id = opts.provider;
    this.label = cfg.label;
    this.client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey,
        maxRetries: 2,
        timeout: 60_000,
        ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
      });
    const overrides = Object.fromEntries(
      Object.entries(opts.models ?? {}).filter(([, v]) => typeof v === "string" && v.length > 0),
    );
    this.models = { ...cfg.models, ...overrides };
  }

  modelFor(tier: ModelTier): string {
    return this.models[tier];
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const model = this.modelFor(req.tier);
    const systemText = [req.system.stable, req.system.volatile].filter(Boolean).join("\n\n");

    try {
      const completion = await this.client.chat.completions.create({
        model,
        max_completion_tokens: req.maxTokens ?? 4096,
        ...(req.responseFormat
          ? {
              response_format: {
                type: "json_schema" as const,
                json_schema: {
                  name: req.responseFormat.name,
                  schema: { ...req.responseFormat.schema, additionalProperties: false },
                  strict: true,
                },
              },
            }
          : {}),
        messages: [{ role: "system", content: systemText }, ...toOpenAIMessages(req.messages)],
        ...(req.tools?.length
          ? {
              tools: req.tools.map((t) => ({
                type: "function" as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: { ...t.inputSchema },
                },
              })),
            }
          : {}),
      });

      const choice = completion.choices[0];
      const message = choice?.message;
      const content: LlmPart[] = [];
      if (message?.content) content.push({ type: "text", text: message.content });
      for (const call of message?.tool_calls ?? []) {
        if (call.type !== "function") continue;
        content.push({
          type: "tool_call",
          id: call.id,
          name: call.function.name,
          input: safeParse(call.function.arguments),
        });
      }

      return {
        content,
        text: (message?.content ?? "").trim(),
        toolCalls: content.filter(
          (p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call",
        ),
        stopReason: mapFinish(choice?.finish_reason),
        model: completion.model ?? model,
        provider: this.id,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          cacheReadTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cacheWriteTokens: 0,
        },
      };
    } catch (error) {
      throw this.toLlmError(error);
    }
  }

  private toLlmError(error: unknown): LlmError {
    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError
    )
      return new LlmError(
        `Llave de ${this.label} inválida o sin permisos`,
        "auth",
        this.id,
        error.status,
      );
    if (error instanceof OpenAI.RateLimitError)
      return new LlmError(
        `Límite de uso de ${this.label} alcanzado`,
        "rate_limit",
        this.id,
        error.status,
      );
    if (error instanceof OpenAI.BadRequestError)
      return new LlmError(
        `Solicitud rechazada por ${this.label}: ${error.message}`,
        "bad_request",
        this.id,
        error.status,
      );
    if (error instanceof OpenAI.InternalServerError || error instanceof OpenAI.APIConnectionError)
      return new LlmError(`${this.label} no está disponible`, "unavailable", this.id);
    if (error instanceof OpenAI.APIError)
      return new LlmError(
        `Error de ${this.label}: ${error.message}`,
        "unknown",
        this.id,
        error.status,
      );
    return new LlmError(error instanceof Error ? error.message : String(error), "unknown", this.id);
  }
}

export function toOpenAIMessages(messages: LlmMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content
        .filter((p): p is Extract<LlmPart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("");
      const calls = m.content.filter(
        (p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call",
      );
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
      continue;
    }

    // usuario: los resultados de herramientas van como mensajes `tool` separados
    const userParts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const p of m.content) {
      if (p.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: p.toolCallId, content: p.content });
      } else if (p.type === "text" && p.text) {
        userParts.push({ type: "text", text: p.text });
      } else if (p.type === "image") {
        userParts.push({
          type: "image_url",
          image_url: { url: `data:${p.mediaType};base64,${p.data}` },
        });
      }
    }
    if (userParts.length > 0) out.push({ role: "user", content: userParts });
  }
  return out;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapFinish(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "stop":
      return "end";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}
