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
  assignedTo: { id: string; name: string } | null;
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

export interface ConnectionsDto {
  channels: Array<{
    channel: Channel;
    configured: boolean;
    missing: string[];
    webhookPath: string | null;
    webhookUrl: string | null;
    lastInboundAt: number | null;
  }>;
  /** Canales por los que llegan los avisos al dueño (telegram, email). */
  notifications: string[];
  /** Transcripción de notas de voz disponible (Workers AI). */
  transcription: boolean;
}

export interface PromptVersionDto {
  id: string;
  label: string;
  author: string | null;
  createdAt: number;
  preview: {
    giro: string;
    tone: string;
    instructionsChars: number;
    faq: number;
    offerings: number;
  };
}

export interface GiroDto {
  id: string;
  name: string;
  pitch: string;
  bookingLabel: string;
  tone: string;
  recommended: string[];
  suggestedQuestions: string[];
  suggestedOfferings: string[];
}

export interface PromptPreviewDto {
  channel: Channel;
  sections: Array<{ id: string; title: string; locked: boolean; text: string }>;
  /** Parte que cambia en cada mensaje (fecha, pasajes de la base de conocimiento). */
  volatile: string;
  totalChars: number;
}

// ---------- analítica y automatización (fase 4) ----------

export interface StatsDto {
  days: number;
  series: Array<{
    day: string;
    conversations: number;
    messages: number;
    leads: number;
    handoffs: number;
    costUsd: number;
  }>;
  averageRating: number | null;
  analyzed: number;
  contacts: number;
  /** Clientes que volvieron a escribir en el periodo (retención). */
  returningContacts: number;
}

export interface CostsDto {
  monthUsd: number;
  projectedUsd: number;
  budgetUsd: number | null;
  byModel: Array<{
    provider: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  }>;
  byDay: Array<{ day: string; costUsd: number }>;
}

export interface InsightDto {
  conversationId: string;
  channel: Channel;
  contactName: string | null;
  contactExternalId: string;
  rating: number;
  sentiment: "positivo" | "neutral" | "negativo";
  resolvedWithoutHuman: boolean;
  openSale: boolean;
  upset: boolean;
  intent: string | null;
  objection: string | null;
  unansweredQuestion: string | null;
  summary: string;
  createdAt: number;
}

export interface InsightsDto {
  items: InsightDto[];
  summary: {
    analyzed: number;
    averageRating: number | null;
    upset: number;
    openSales: number;
    resolvedWithoutHumanPct: number;
    positivePct: number;
    topIntents: Array<{ label: string; count: number }>;
    topObjections: Array<{ label: string; count: number }>;
  };
}

export interface AutomationReportDto {
  closed: number;
  analyzed: number;
  alerts: number;
  surveys: number;
  reviews: number;
  hunted: number;
  noShows: number;
  reminders: number;
  campaignSent: number;
  dailyReport: boolean;
  watchdog: boolean;
  errors: string[];
}

// ---------- integraciones (fase 5) ----------

export interface GalleryItemDto {
  id: string;
  name: string;
  description: string;
  kind: "image" | "video" | "audio" | "document";
  contentType: string;
  size: number;
  url: string;
  createdAt: number;
}

export interface PaymentDto {
  id: string;
  conversationId: string | null;
  concept: string;
  amount: number;
  currency: string;
  url: string;
  status: "pending" | "paid" | "expired";
  createdAt: number;
  paidAt: number | null;
}

export interface AppointmentDto {
  id: string;
  conversationId: string | null;
  attendeeName: string | null;
  startAt: number;
  status: "confirmed" | "cancelled";
  remindedAt: number | null;
}

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  segment: z.object({
    /** Estados de lead a incluir; vacío = todos los contactos con conversación. */
    statuses: z.array(z.enum(LEAD_STATUSES)).max(4).default([]),
    channels: z
      .array(z.enum(["whatsapp", "telegram", "instagram", "messenger"]))
      .min(1)
      .max(4),
  }),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export interface CampaignDto {
  id: string;
  name: string;
  message: string;
  segment: CampaignInput["segment"];
  status: "draft" | "sending" | "done";
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  createdAt: number;
}

// ---------- Modo agencia ----------

export const agencyClientInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  niche: z.string().trim().max(80).optional(),
  url: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((u) => /^https?:\/\//i.test(u), "Solo http(s)"),
  token: z.string().trim().min(16).max(200),
  monthlyFee: z.number().nonnegative().max(1_000_000).optional(),
});
export type AgencyClientInput = z.infer<typeof agencyClientInputSchema>;

export interface AgencyClientDto {
  id: string;
  name: string;
  niche: string | null;
  url: string;
  monthlyFee: number | null;
  /** Estado leído en vivo del bot del cliente. */
  online: boolean;
  version: string | null;
  summary: SummaryDto | null;
  error: string | null;
}

export interface AgencyLeadDto extends LeadDto {
  clientId: string;
  clientName: string;
}

// ---------- equipo y marca blanca (fase 7) ----------

export type UserRole = "admin" | "team";

export const teamInviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["admin", "team"]),
});

export const userUpdateSchema = z.object({
  role: z.enum(["admin", "team"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const accessAcceptSchema = z.object({
  password: z.string().min(8).max(200),
  whatsapp: z.string().trim().max(40).optional(),
  position: z.string().trim().max(80).optional(),
});

export const loginWithEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const assignInputSchema = z.object({ userId: z.string().max(64).nullable() });

/** Equipo de agencia: hasta 3 accesos personales con permiso sobre Modo agencia. */
export const MAX_AGENCY_COLLABORATORS = 3;
export type AgencyAccess = "edit" | "read";
export const agencyAccessInputSchema = z.object({ access: z.enum(["edit", "read"]).nullable() });

/** Cambiar el token, el nombre o la mensualidad de un bot del portafolio. */
export const agencyClientUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    niche: z.string().trim().max(80),
    token: z.string().trim().min(16).max(200),
    monthlyFee: z.number().nonnegative().max(1_000_000).nullable(),
  })
  .partial();

export interface TeamUserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "invited" | "active" | "disabled";
  whatsapp: string | null;
  position: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  /** Permiso sobre Modo agencia (equipo de agencia); `null` = no lo ve. */
  agencyAccess: "edit" | "read" | null;
}

export interface AuditEntryDto {
  id: string;
  actorName: string | null;
  action: string;
  detail: string | null;
  createdAt: number;
}

export interface SessionDto {
  authenticated: boolean;
  botName: string;
  hasPassword: boolean;
  actor: { id: string; name: string; role: "owner" | UserRole } | null;
  /** Pestañas que este acceso puede abrir; `null` = todas. */
  allowedTabs: string[] | null;
  /** Qué puede hacer en Modo agencia: el dueño edita; los colaboradores según su permiso. */
  agencyAccess: "edit" | "read" | null;
  branding: {
    panelName: string;
    logoUrl: string;
    accentColor: string;
    style: "nimbus" | "onyx" | "terra";
    font: string;
    loginTitle: string;
    loginSubtitle: string;
  };
}
