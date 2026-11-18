import type { ModelTier, ProviderId } from "@yunque/core";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Parte de un mensaje en formato neutral, independiente del proveedor. */
export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: ImageMediaType; data: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean }
  /**
   * Bloque propio de un proveedor que debe devolverse tal cual dentro del mismo turno
   * (p. ej. los bloques de razonamiento de Claude entre llamadas a herramientas).
   * Los demás proveedores lo ignoran.
   */
  | { type: "provider_raw"; provider: ProviderId; block: unknown };

export interface LlmMessage {
  role: "user" | "assistant";
  content: LlmPart[];
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface LlmTool {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
}

export interface GenerateRequest {
  system: {
    /** Parte estable y cacheable. */
    stable: string;
    /** Parte volátil (fecha, contexto del turno). */
    volatile?: string;
  };
  messages: LlmMessage[];
  tools?: LlmTool[];
  tier: ModelTier;
  maxTokens?: number;
  /** Fuerza una respuesta JSON que cumpla este esquema (salida estructurada). */
  responseFormat?: { name: string; schema: JsonSchemaObject };
}

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerateResponse {
  /** Contenido del asistente en orden, listo para reinyectar en el historial del turno. */
  content: LlmPart[];
  /** Texto concatenado de la respuesta. */
  text: string;
  toolCalls: Array<Extract<LlmPart, { type: "tool_call" }>>;
  stopReason: StopReason;
  /** Modelo que efectivamente respondió (puede diferir si hubo fallback). */
  model: string;
  provider: ProviderId;
  usage: TokenUsage;
}

export interface LlmProvider {
  readonly id: ProviderId;
  modelFor(tier: ModelTier): string;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
}

export type LlmErrorKind = "auth" | "rate_limit" | "bad_request" | "unavailable" | "unknown";

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly provider: ProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "unavailable";
  }
}

export function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function textOf(parts: LlmPart[]): string {
  return parts
    .filter((p): p is Extract<LlmPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
}
