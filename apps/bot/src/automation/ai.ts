import { type BusinessProfile, renderBusinessInfo, VOICE_PRESETS } from "@yunque/core";
import type { GenerateResponse, JsonSchemaObject, LlmProvider } from "@yunque/llm";
import { z } from "zod";
import type { MessageRecord } from "../store/types.js";
import type { Insight } from "./store.js";

function transcript(messages: MessageRecord[]): string {
  const who = { user: "Cliente", assistant: "Bot", human: "Equipo", note: "Nota interna" } as const;
  return messages
    .filter((m) => m.role !== "note")
    .map((m) => `${who[m.role]}: ${m.content}`)
    .join("\n");
}

// ---------- Vigilante ----------

const INSIGHT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    rating: { type: "integer", description: "Calidad de la atención del bot, 1 a 5" },
    sentiment: { type: "string", enum: ["positivo", "neutral", "negativo"] },
    resolved_without_human: { type: "boolean" },
    open_sale: {
      type: "boolean",
      description: "Quedó una venta, reserva o cotización a medio camino",
    },
    upset: { type: "boolean", description: "El cliente terminó molesto o frustrado" },
    intent: { type: "string", description: "Qué quería el cliente, en pocas palabras" },
    objection: { type: "string", description: "Objeción principal, o vacío" },
    unanswered_question: {
      type: "string",
      description: "Pregunta que el bot no supo responder, o vacío",
    },
    summary: { type: "string", description: "Resumen en una o dos frases" },
    customer_memory: {
      type: "string",
      description: "Datos útiles del cliente para la próxima vez (preferencias, contexto), o vacío",
    },
  },
  required: [
    "rating",
    "sentiment",
    "resolved_without_human",
    "open_sale",
    "upset",
    "intent",
    "objection",
    "unanswered_question",
    "summary",
    "customer_memory",
  ],
};

const insightSchema = z.object({
  rating: z.number(),
  sentiment: z.enum(["positivo", "neutral", "negativo"]),
  resolved_without_human: z.boolean(),
  open_sale: z.boolean(),
  upset: z.boolean(),
  intent: z.string(),
  objection: z.string(),
  unanswered_question: z.string(),
  summary: z.string(),
  customer_memory: z.string(),
});

const ANALYST_SYSTEM = `Eres el analista de calidad de la atención por chat de un negocio. Lees una conversación terminada entre un cliente, el bot del negocio y, a veces, una persona del equipo, y la calificas con criterio de dueño de negocio.

- rating: 5 = resolvió rápido y bien; 3 = cumplió a medias; 1 = respondió mal, inventó o hizo enojar al cliente.
- open_sale: true si el cliente mostró intención de comprar, reservar o cotizar y no se concretó.
- upset: true solo si hay señales claras de molestia o frustración.
- customer_memory: datos que sirvan para atenderlo mejor la próxima vez; nunca datos sensibles (tarjetas, documentos, salud).
Responde solo con el JSON pedido, en español.`;

export interface InsightResult {
  insight: Insight;
  memory: string;
  response: GenerateResponse;
}

export async function analyzeConversation(
  provider: LlmProvider,
  messages: MessageRecord[],
): Promise<InsightResult | null> {
  const response = await provider.generate({
    tier: "fast",
    maxTokens: 4000,
    system: { stable: ANALYST_SYSTEM },
    messages: [
      { role: "user", content: [{ type: "text", text: `CONVERSACIÓN\n${transcript(messages)}` }] },
    ],
    responseFormat: { name: "analisis_conversacion", schema: INSIGHT_SCHEMA },
  });
  const json = response.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const parsed = insightSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    insight: {
      rating: Math.min(5, Math.max(1, Math.round(d.rating))),
      sentiment: d.sentiment,
      resolvedWithoutHuman: d.resolved_without_human,
      openSale: d.open_sale,
      upset: d.upset,
      intent: d.intent.slice(0, 300),
      objection: d.objection.slice(0, 300),
      unansweredQuestion: d.unanswered_question.slice(0, 300),
      summary: d.summary.slice(0, 600),
    },
    memory: d.customer_memory.trim(),
    response,
  };
}

// ---------- Cazador y Recupera no-shows ----------

export type FollowUpKind = "cazador" | "no_show";

const FOLLOW_UP_GOAL: Record<FollowUpKind, string> = {
  cazador:
    "El cliente preguntó y dejó de responder hace unas horas. Escribe UN mensaje de seguimiento natural que retome justo donde quedó la conversación y le facilite el siguiente paso.",
  no_show:
    "El cliente mostró interés hace algunos días y no volvió. Escribe UN mensaje amable para retomar el contacto, recordando lo que le interesaba, sin presionar.",
};

export async function writeFollowUp(args: {
  provider: LlmProvider;
  profile: BusinessProfile;
  messages: MessageRecord[];
  kind: FollowUpKind;
}): Promise<{ text: string; response: GenerateResponse }> {
  const system = `Escribes mensajes de seguimiento por chat en nombre de "${args.profile.name}".
${FOLLOW_UP_GOAL[args.kind]}

Reglas: máximo 2 líneas; una sola pregunta; nada de presión, urgencias falsas, descuentos ni datos que no estén en la información del negocio; no digas que eres un bot ni menciones que es un seguimiento automático.

## Voz
${VOICE_PRESETS[args.profile.tone]}

## Información del negocio
${renderBusinessInfo(args.profile)}

Responde solo con el texto del mensaje.`;
  const response = await args.provider.generate({
    tier: "fast",
    maxTokens: 2000,
    system: { stable: system },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `CONVERSACIÓN\n${transcript(args.messages.slice(-12))}` }],
      },
    ],
  });
  const text = response.text
    .replace(/^["«]|["»]$/g, "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 2)
    .join("\n")
    .trim();
  return { text, response };
}
