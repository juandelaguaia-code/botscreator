import type { ModelTier } from "@yunque/core";
import {
  emptyUsage,
  type GenerateRequest,
  type GenerateResponse,
  type LlmPart,
  type LlmProvider,
  textOf,
} from "../types.js";

export type FakeScript = (req: GenerateRequest, callIndex: number) => LlmPart[];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /\+?\d[\d\s-]{7,}\d/;

/**
 * Proveedor determinista para tests y para correr el bot en local sin llaves.
 * Sin guion propio: captura leads cuando ve un correo/teléfono, escala ante quejas y si no,
 * contesta con un eco que deja ver qué entendió.
 */
export class FakeProvider implements LlmProvider {
  readonly id = "fake" as const;
  readonly calls: GenerateRequest[] = [];

  constructor(private readonly script: FakeScript = defaultScript) {}

  modelFor(tier: ModelTier): string {
    return `fake-${tier}`;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(req);
    const content = this.script(req, this.calls.length - 1);
    const toolCalls = content.filter(
      (p): p is Extract<LlmPart, { type: "tool_call" }> => p.type === "tool_call",
    );
    const text = textOf(content);
    return {
      content,
      text,
      toolCalls,
      stopReason: toolCalls.length > 0 ? "tool_use" : "end",
      model: this.modelFor(req.tier),
      provider: this.id,
      usage: {
        ...emptyUsage(),
        inputTokens: req.system.stable.length / 4,
        outputTokens: text.length / 4,
      },
    };
  }
}

function lastUserText(req: GenerateRequest): { text: string; afterToolResult: boolean } {
  const last = req.messages.at(-1);
  if (last?.role !== "user") return { text: "", afterToolResult: false };
  const afterToolResult = last.content.some((p) => p.type === "tool_result");
  return { text: textOf(last.content), afterToolResult };
}

const defaultScript: FakeScript = (req, callIndex) => {
  // verificaciones y otras salidas estructuradas: en modo prueba todo está respaldado
  if (req.responseFormat)
    return [{ type: "text", text: JSON.stringify({ supported: true, unsupported: [] }) }];
  const { text, afterToolResult } = lastUserText(req);
  if (afterToolResult)
    return [{ type: "text", text: "¡Listo! Ya quedó registrado. ¿Te ayudo con algo más?" }];

  const toolNames = new Set(req.tools?.map((t) => t.name) ?? []);
  const email = text.match(EMAIL)?.[0];
  const phone = text.match(PHONE)?.[0];

  if ((email || phone) && toolNames.has("capturar_lead")) {
    return [
      {
        type: "tool_call",
        id: `fake_call_${callIndex}`,
        name: "capturar_lead",
        input: {
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          interest: text.slice(0, 120),
        },
      },
    ];
  }

  if (/\b(queja|reclamo|molest|complain)/i.test(text) && toolNames.has("pedir_humano")) {
    return [
      { type: "text", text: "Lamento mucho lo ocurrido, ya le aviso al equipo." },
      {
        type: "tool_call",
        id: `fake_call_${callIndex}`,
        name: "pedir_humano",
        input: { reason: "queja del cliente" },
      },
    ];
  }

  return [{ type: "text", text: `[modo prueba · ${req.tier}] Recibí: "${text}"` }];
};
