import { findUnsupportedClaims, hasUnsupportedClaims } from "@yunque/core";
import type { GenerateResponse, JsonSchemaObject, LlmProvider } from "@yunque/llm";
import { z } from "zod";

/**
 * Blindaje · verificador pre-envío.
 *
 * 1. Chequeo barato: ¿hay cifras o palabras de promesa en la respuesta que no aparezcan en la
 *    fuente de verdad? Si no hay, la respuesta sale sin gastar nada más.
 * 2. Si hay sospechas, el modelo rápido decide con salida estructurada si están respaldadas.
 */

const VERDICT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    supported: { type: "boolean" },
    unsupported: { type: "array", items: { type: "string" } },
  },
  required: ["supported", "unsupported"],
};

const verdictSchema = z.object({ supported: z.boolean(), unsupported: z.array(z.string()) });

const VERIFIER_SYSTEM = `Eres el verificador de datos del chat de atención de un negocio. Recibes la fuente de verdad del negocio y una respuesta que el asistente quiere enviar a un cliente.

Decide si cada afirmación concreta de la respuesta está respaldada por la fuente: precios, montos, horarios, fechas, plazos, porcentajes, descuentos, promociones, regalos, garantías y políticas.
- Cuentan como respaldadas: datos que están en la fuente, cifras que repiten lo que dijo el cliente, la fecha y hora actuales, y cálculos directos con datos de la fuente.
- Saludos, preguntas al cliente y frases sin datos concretos no se evalúan.
- Si una afirmación no se puede comprobar con la fuente, no está respaldada.

Responde solo con el JSON pedido. En "unsupported" escribe cada afirmación sin respaldo en pocas palabras.`;

export interface VerifyResult {
  ok: boolean;
  unsupported: string[];
  /** Se usó el modelo (hubo sospechas en el chequeo barato). */
  checkedWithModel: boolean;
  response?: GenerateResponse;
}

export async function verifyReply(args: {
  provider: LlmProvider;
  reply: string;
  source: string;
}): Promise<VerifyResult> {
  const suspects = findUnsupportedClaims(args.reply, args.source);
  if (!hasUnsupportedClaims(suspects))
    return { ok: true, unsupported: [], checkedWithModel: false };

  const response = await args.provider.generate({
    tier: "fast",
    maxTokens: 4000,
    system: { stable: VERIFIER_SYSTEM },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `FUENTE DE VERDAD\n${args.source}\n\nRESPUESTA DEL ASISTENTE\n${args.reply}\n\nDatos a revisar: ${[...suspects.numbers, ...suspects.promises].join(", ")}`,
          },
        ],
      },
    ],
    responseFormat: { name: "veredicto", schema: VERDICT_SCHEMA },
  });

  const verdict = parseVerdict(response.text);
  if (!verdict) {
    // sin veredicto legible no bloqueamos: la disponibilidad pesa más que un falso positivo
    return { ok: true, unsupported: [], checkedWithModel: true, response };
  }
  const unsupported = verdict.supported
    ? []
    : verdict.unsupported.length > 0
      ? verdict.unsupported
      : [...suspects.numbers, ...suspects.promises];
  return { ok: verdict.supported, unsupported, checkedWithModel: true, response };
}

function parseVerdict(text: string): z.infer<typeof verdictSchema> | null {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const parsed = verdictSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
