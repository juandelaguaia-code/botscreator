import { z } from "zod";
import { businessProfileSchema } from "./business.js";
import { botSettingsSchema } from "./settings.js";

/**
 * Contratos de la API del panel. El Worker valida las entradas con estos esquemas y el panel
 * usa los mismos tipos, así un cambio de forma rompe la compilación de ambos lados.
 */

export const CHANNELS = [
  "web",
  "telegram",
  "whatsapp",
  "instagram",
  "messenger",
  "playground",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const LEAD_STATUSES = ["nuevo", "contactado", "ganado", "perdido"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const TICKET_KINDS = ["handoff", "knowledge_gap", "system"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export type MessageRole = "user" | "assistant" | "human" | "note";

// ---------- entradas ----------

export const loginInputSchema = z.object({ password: z.string().min(1).max(200) });

export const replyInputSchema = z.object({ text: z.string().trim().min(1).max(4000) });

export const noteInputSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const pauseInputSchema = z.object({
  /** Minutos de pausa; `null` = hasta reactivar a mano. */
  minutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .nullable(),
});

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const settingsUpdateSchema = z.object({
  profile: businessProfileSchema.optional(),
  settings: botSettingsSchema.optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export const playgroundInputSchema = z.object({
  sessionId: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
});

export const webChatInputSchema = z.object({
  visitorId: z.string().trim().min(8).max(64),
  text: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(120).optional(),
});

// ---------- salidas ----------

export interface SummaryDto {
  conversations24h: number;
  messages24h: number;
  uniqueContacts30d: number;
  newLeads30d: number;
  openTickets: number;
  needsHuman: number;
  /** Porcentaje de conversaciones de 30 días que no requirieron humano. */
  resolvedWithoutHumanPct: number;
  costMonthUsd: number;
}

export interface ConversationListItemDto {
  id: string;
  channel: Channel;
  contact: { id: string; name: string | null; externalId: string };
  lastMessagePreview: string | null;
  lastMessageAt: number;
  unread: number;
  needsHuman: boolean;
  pausedUntil: number | null;
  isLead: boolean;
  status: "open" | "closed";
}

export interface MessageDto {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  meta: Record<string, unknown> | null;
}

export interface ConversationDetailDto extends ConversationListItemDto {
  messages: MessageDto[];
}

export interface LeadDto {
  id: string;
  conversationId: string | null;
  contactId: string;
  channel: Channel;
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  notes: string | null;
  status: LeadStatus;
  createdAt: number;
}

export interface TicketDto {
  id: string;
  conversationId: string | null;
  kind: TicketKind;
  reason: string;
  status: "open" | "resolved";
  createdAt: number;
  resolvedAt: number | null;
}

export interface SettingsDto {
  profile: z.infer<typeof businessProfileSchema>;
  settings: z.infer<typeof botSettingsSchema>;
  /** Proveedores con llave configurada como secreto (nunca se expone la llave). */
  configuredProviders: string[];
  channels: { web: boolean; telegram: boolean };
  knowledge: KnowledgeEngineDto;
}

export interface PlaygroundReplyDto {
  reply: string | null;
  buttons: string[];
  conversationId: string;
  model: string | null;
  handoff: boolean;
  /** El Blindaje frenó la respuesta original (se muestra para que el dueño entienda por qué). */
  blocked: { draft: string; unsupported: string[] } | null;
  /** Pasajes de la base de conocimiento usados en el turno. */
  passages: Array<{ title: string; score: number }>;
}

// ---------- base de conocimiento y radar de huecos ----------

export const kbDocumentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(100_000),
});

export const kbImportUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "Solo direcciones http(s)"),
});

export const kbSearchInputSchema = z.object({ query: z.string().trim().min(1).max(500) });

export const gapResolveInputSchema = z.object({
  /** Respuesta del dueño; si viene, se agrega como pregunta frecuente. */
  answer: z.string().trim().max(1500).optional(),
});

export interface KnowledgeEngineDto {
  /** Modelo de embeddings activo. */
  embedder: string;
  /** `vectorize` en producción; `d1` en desarrollo local. */
  index: "vectorize" | "d1";
  /** Umbral recomendado por el motor (se usa cuando el dueño no fija uno). */
  recommendedMinScore: number;
}

export interface KbDocumentDto {
  id: string;
  title: string;
  source: "manual" | "url";
  sourceUrl: string | null;
  chunkCount: number;
  chars: number;
  status: "ready" | "error";
  error: string | null;
  /** El documento se indexó con otro motor y conviene reindexar. */
  stale: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KbDocumentDetailDto extends KbDocumentDto {
  content: string;
}

export interface KbSearchResultDto {
  minScore: number;
  results: Array<{
    documentId: string;
    title: string;
    text: string;
    score: number;
    passes: boolean;
  }>;
}

export const GAP_SOURCES = ["kb_miss", "verifier", "handoff"] as const;
export type GapSource = (typeof GAP_SOURCES)[number];

export interface KnowledgeGapDto {
  id: string;
  question: string;
  source: GapSource;
  conversationId: string | null;
  hits: number;
  status: "open" | "resolved" | "ignored";
  resolution: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

export type ConversationFilter = "all" | "needs_human" | "unread" | "leads";
