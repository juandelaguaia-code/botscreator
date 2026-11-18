import type {
  Channel,
  ConversationFilter,
  LeadStatus,
  MessageRole,
  SummaryDto,
  TicketKind,
} from "@yunque/core";

export interface ContactRecord {
  id: string;
  channel: Channel;
  externalId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  createdAt: number;
}

export interface ConversationRecord {
  id: string;
  contactId: string;
  channel: Channel;
  status: "open" | "closed";
  needsHuman: boolean;
  pausedUntil: number | null;
  unread: number;
  lastMessageAt: number;
  lastMessagePreview: string | null;
  lastCustomerMessageAt: number | null;
  createdAt: number;
}

export interface ConversationListRow extends ConversationRecord {
  assignedTo: { id: string; name: string } | null;
  contactName: string | null;
  contactExternalId: string;
  isLead: boolean;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  meta: Record<string, unknown> | null;
  createdAt: number;
}

export interface LeadRecord {
  id: string;
  contactId: string;
  conversationId: string | null;
  channel: Channel;
  name: string | null;
  phone: string | null;
  email: string | null;
  interest: string | null;
  notes: string | null;
  status: LeadStatus;
  createdAt: number;
}

export interface TicketRecord {
  id: string;
  conversationId: string | null;
  kind: TicketKind;
  reason: string;
  status: "open" | "resolved";
  createdAt: number;
  resolvedAt: number | null;
}

export interface ExportMessageRow {
  conversationId: string;
  channel: Channel;
  contactId: string;
  contactName: string | null;
  contactExternalId: string;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface UsageInput {
  conversationId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export type ConversationPatch = Partial<
  Pick<
    ConversationRecord,
    | "status"
    | "needsHuman"
    | "pausedUntil"
    | "unread"
    | "lastMessageAt"
    | "lastMessagePreview"
    | "lastCustomerMessageAt"
  >
>;

export interface LeadInput {
  contactId: string;
  conversationId: string | null;
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
}

/** Puerto de persistencia. Implementación de producción: D1 (`D1Store`). */
export interface Store {
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;

  upsertContact(input: {
    channel: Channel;
    externalId: string;
    name?: string;
  }): Promise<ContactRecord>;
  getContact(id: string): Promise<ContactRecord | null>;
  findContact(channel: Channel, externalId: string): Promise<ContactRecord | null>;
  updateContact(
    id: string,
    patch: { name?: string; phone?: string; email?: string },
  ): Promise<void>;

  findOpenConversation(contactId: string, channel: Channel): Promise<ConversationRecord | null>;
  createConversation(input: { contactId: string; channel: Channel }): Promise<ConversationRecord>;
  getConversation(id: string): Promise<ConversationRecord | null>;
  updateConversation(id: string, patch: ConversationPatch): Promise<void>;
  listConversations(
    filter: ConversationFilter,
    limit: number,
    search?: string,
  ): Promise<ConversationListRow[]>;
  getConversationRow(id: string): Promise<ConversationListRow | null>;

  addMessage(input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    meta?: Record<string, unknown> | null;
  }): Promise<MessageRecord>;
  /** Últimos `limit` mensajes, en orden cronológico. */
  listMessages(conversationId: string, limit: number): Promise<MessageRecord[]>;
  listMessagesSince(conversationId: string, since: number): Promise<MessageRecord[]>;
  countCustomerMessages(conversationId: string, since?: number): Promise<number>;

  upsertLead(input: LeadInput): Promise<LeadRecord>;
  listLeads(limit: number): Promise<LeadRecord[]>;
  updateLead(
    id: string,
    patch: { status?: LeadStatus; notes?: string },
  ): Promise<LeadRecord | null>;

  createTicket(input: {
    conversationId: string | null;
    kind: TicketKind;
    reason: string;
  }): Promise<TicketRecord>;
  findOpenTicket(conversationId: string, kind: TicketKind): Promise<TicketRecord | null>;
  listTickets(status: "open" | "resolved" | "all", limit: number): Promise<TicketRecord[]>;
  resolveTicket(id: string): Promise<boolean>;

  recordUsage(input: UsageInput): Promise<void>;
  /** Último mensaje de un cliente por canal (para saber si un canal está vivo). */
  lastInboundByChannel(): Promise<Partial<Record<Channel, number>>>;
  /** Mensajes con su conversación y contacto, en orden, para exportar. */
  exportMessages(limit: number): Promise<ExportMessageRow[]>;
  summary(now: number): Promise<SummaryDto>;

  getLoginAttempt(key: string): Promise<{ failures: number; lockedUntil: number | null } | null>;
  saveLoginAttempt(key: string, failures: number, lockedUntil: number | null): Promise<void>;
  clearLoginAttempt(key: string): Promise<void>;
}
