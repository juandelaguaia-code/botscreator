import { TOOL_NAMES } from "@yunque/core";
import type { LlmTool, ToolHandler } from "@yunque/llm";
import { z } from "zod";
import type { SearchHit } from "../knowledge/service.js";
import type { ContactRecord, ConversationRecord, Store } from "../store/types.js";

export const BUILTIN_TOOLS: LlmTool[] = [
  {
    name: TOOL_NAMES.captureLead,
    description:
      "Registra a un cliente interesado (quiere comprar, reservar, cotizar o que lo contacten) con los datos que haya dado. Llámala en cuanto tengas su nombre o un dato de contacto; puedes volver a llamarla para completar datos.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del cliente" },
        phone: { type: "string", description: "Teléfono o WhatsApp" },
        email: { type: "string", description: "Correo electrónico" },
        interest: { type: "string", description: "Qué le interesa, en pocas palabras" },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.requestHuman,
    description:
      "Avisa al equipo humano del negocio para que tome la conversación. Úsala cuando el cliente pide una persona, hay una queja, un tema de facturación o legal, no logras resolver lo que pide, o te falta un dato para responder.",
    inputSchema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo concreto del escalamiento" },
        missing_info: {
          type: "string",
          description:
            "Si escalas porque te falta un dato del negocio, cuál es (p. ej. «precio del corte con barba»)",
        },
      },
      required: ["reason"],
    },
  },
];

export const SEARCH_TOOL: LlmTool = {
  name: TOOL_NAMES.searchKnowledge,
  description:
    "Busca en la base de conocimiento del negocio (documentos, políticas, catálogo). Úsala cuando el cliente pregunta algo que no está en la información del negocio ni en los pasajes que ya recibiste. Formula la búsqueda como una pregunta concreta.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Qué buscar, en una frase" } },
    required: ["query"],
  },
};

const leadInput = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(200).optional(),
  interest: z.string().trim().max(500).optional(),
});

const humanInput = z.object({
  reason: z.string().trim().min(1).max(500),
  missing_info: z.string().trim().max(300).optional(),
});

const searchInput = z.object({ query: z.string().trim().min(1).max(500) });

export interface ToolContext {
  store: Store;
  contact: ContactRecord;
  conversation: ConversationRecord;
  /** Se llama al escalar; el motor decide cómo avisar. */
  onHandoff: (reason: string) => Promise<void>;
  /** Un dato que el bot necesitaba y no tenía (va al radar de huecos). */
  onMissingInfo?: (info: string) => Promise<void>;
  /** Búsqueda en la base de conocimiento, si el bot tiene una. */
  search?: (query: string) => Promise<{ passing: SearchHit[] }>;
}

const blank = (v: string | undefined): string | undefined => (v && v.length > 0 ? v : undefined);

export function buildToolHandlers(ctx: ToolContext): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {
    [TOOL_NAMES.captureLead]: async (raw) => {
      const parsed = leadInput.safeParse(raw);
      if (!parsed.success)
        return { content: "Datos inválidos para registrar el lead.", isError: true };
      const name = blank(parsed.data.name);
      const phone = blank(parsed.data.phone);
      const email = blank(parsed.data.email);
      const interest = blank(parsed.data.interest);
      if (!name && !phone && !email) {
        return {
          content: "Falta al menos el nombre o un dato de contacto. Pídelo con naturalidad.",
          isError: true,
        };
      }
      await ctx.store.upsertLead({
        contactId: ctx.contact.id,
        conversationId: ctx.conversation.id,
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(interest ? { interest } : {}),
      });
      await ctx.store.updateContact(ctx.contact.id, {
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
      });
      return {
        content:
          "Lead registrado. Continúa la conversación con naturalidad, sin mencionar el registro.",
      };
    },

    [TOOL_NAMES.requestHuman]: async (raw) => {
      const parsed = humanInput.safeParse(raw);
      if (!parsed.success) return { content: "Indica el motivo del escalamiento.", isError: true };
      const missing = blank(parsed.data.missing_info);
      if (missing && ctx.onMissingInfo) await ctx.onMissingInfo(missing);
      await ctx.onHandoff(
        missing ? `${parsed.data.reason} (falta: ${missing})` : parsed.data.reason,
      );
      return {
        content:
          "El equipo ya fue avisado. Dile al cliente, con tus palabras y en una frase, que una persona lo atenderá pronto. No prometas tiempos.",
      };
    },
  };

  const search = ctx.search;
  if (search) {
    handlers[TOOL_NAMES.searchKnowledge] = async (raw) => {
      const parsed = searchInput.safeParse(raw);
      if (!parsed.success) return { content: "Escribe qué buscar.", isError: true };
      const { passing } = await search(parsed.data.query);
      if (passing.length === 0) {
        return {
          content:
            "Sin información confiable sobre esto en la base del negocio. No lo afirmes ni lo estimes: di que lo confirmas con el equipo.",
        };
      }
      return {
        content: passing
          .map((h, i) => `[${i + 1}] (${h.title}, relevancia ${h.score.toFixed(2)})\n${h.text}`)
          .join("\n\n"),
      };
    };
  }
  return handlers;
}
