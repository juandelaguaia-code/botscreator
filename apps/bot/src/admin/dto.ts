import type { ConversationListItemDto, LeadDto, MessageDto, TicketDto } from "@yunque/core";
import type {
  ConversationListRow,
  LeadRecord,
  MessageRecord,
  TicketRecord,
} from "../store/types.js";

export function toConversationDto(r: ConversationListRow): ConversationListItemDto {
  return {
    id: r.id,
    channel: r.channel,
    contact: { id: r.contactId, name: r.contactName, externalId: r.contactExternalId },
    lastMessagePreview: r.lastMessagePreview,
    lastMessageAt: r.lastMessageAt,
    unread: r.unread,
    needsHuman: r.needsHuman,
    pausedUntil: r.pausedUntil && r.pausedUntil > Date.now() ? r.pausedUntil : null,
    isLead: r.isLead,
    assignedTo: r.assignedTo,
    status: r.status,
  };
}

export function toMessageDto(m: MessageRecord): MessageDto {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt, meta: m.meta };
}

export function toLeadDto(l: LeadRecord): LeadDto {
  return {
    id: l.id,
    conversationId: l.conversationId,
    contactId: l.contactId,
    channel: l.channel,
    name: l.name,
    phone: l.phone,
    email: l.email,
    interest: l.interest,
    notes: l.notes,
    status: l.status,
    createdAt: l.createdAt,
  };
}

export function toTicketDto(t: TicketRecord): TicketDto {
  return {
    id: t.id,
    conversationId: t.conversationId,
    kind: t.kind,
    reason: t.reason,
    status: t.status,
    createdAt: t.createdAt,
    resolvedAt: t.resolvedAt,
  };
}
