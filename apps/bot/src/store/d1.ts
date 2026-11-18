import type {
  Channel,
  ConversationFilter,
  LeadStatus,
  MessageRole,
  SummaryDto,
  TicketKind,
} from "@yunque/core";
import { newId } from "../lib/crypto.js";
import type {
  ContactRecord,
  ConversationListRow,
  ConversationPatch,
  ConversationRecord,
  ExportMessageRow,
  LeadInput,
  LeadRecord,
  MessageRecord,
  Store,
  TicketRecord,
  UsageInput,
} from "./types.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function parseJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== "string" || v.length === 0) return null;
  try {
    return JSON.parse(v) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toContact(r: Row): ContactRecord {
  return {
    id: String(r.id),
    channel: String(r.channel) as Channel,
    externalId: String(r.external_id),
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    createdAt: num(r.created_at),
  };
}

function toConversation(r: Row): ConversationRecord {
  return {
    id: String(r.id),
    contactId: String(r.contact_id),
    channel: String(r.channel) as Channel,
    status: r.status === "closed" ? "closed" : "open",
    needsHuman: num(r.needs_human) === 1,
    pausedUntil: numOrNull(r.paused_until),
    unread: num(r.unread),
    lastMessageAt: num(r.last_message_at),
    lastMessagePreview: str(r.last_message_preview),
    lastCustomerMessageAt: numOrNull(r.last_customer_message_at),
    createdAt: num(r.created_at),
  };
}

function toConversationRow(r: Row): ConversationListRow {
  return {
    ...toConversation(r),
    contactName: str(r.contact_name),
    contactExternalId: String(r.contact_external_id),
    isLead: num(r.is_lead) === 1,
  };
}

function toMessage(r: Row): MessageRecord {
  return {
    id: String(r.id),
    conversationId: String(r.conversation_id),
    role: String(r.role) as MessageRole,
    content: String(r.content),
    meta: parseJson(r.meta),
    createdAt: num(r.created_at),
  };
}

function toLead(r: Row): LeadRecord {
  return {
    id: String(r.id),
    contactId: String(r.contact_id),
    conversationId: str(r.conversation_id),
    channel: String(r.channel) as Channel,
    name: str(r.name),
    phone: str(r.phone),
    email: str(r.email),
    interest: str(r.interest),
    notes: str(r.notes),
    status: String(r.status) as LeadStatus,
    createdAt: num(r.created_at),
  };
}

function toTicket(r: Row): TicketRecord {
  return {
    id: String(r.id),
    conversationId: str(r.conversation_id),
    kind: String(r.kind) as TicketKind,
    reason: String(r.reason),
    status: r.status === "resolved" ? "resolved" : "open",
    createdAt: num(r.created_at),
    resolvedAt: numOrNull(r.resolved_at),
  };
}

const CONVERSATION_ROW_SELECT = `
  SELECT cv.*, ct.name AS contact_name, ct.external_id AS contact_external_id,
         EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = cv.contact_id) AS is_lead
  FROM conversations cv
  JOIN contacts ct ON ct.id = cv.contact_id`;

const CONVERSATION_COLUMNS: Record<keyof ConversationPatch, string> = {
  status: "status",
  needsHuman: "needs_human",
  pausedUntil: "paused_until",
  unread: "unread",
  lastMessageAt: "last_message_at",
  lastMessagePreview: "last_message_preview",
  lastCustomerMessageAt: "last_customer_message_at",
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class D1Store implements Store {
  constructor(
    private readonly db: D1Database,
    private readonly clock: () => number = Date.now,
  ) {}

  // ---------- settings ----------

  async getSetting<T>(key: string): Promise<T | null> {
    const row = await this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .bind(key)
      .first<Row>();
    if (!row) return null;
    try {
      return JSON.parse(String(row.value)) as T;
    } catch {
      return null;
    }
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key, JSON.stringify(value), this.clock())
      .run();
  }

  // ---------- contactos ----------

  async upsertContact(input: {
    channel: Channel;
    externalId: string;
    name?: string;
  }): Promise<ContactRecord> {
    const now = this.clock();
    const row = await this.db
      .prepare(
        `INSERT INTO contacts (id, channel, external_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (channel, external_id) DO UPDATE SET
           name = COALESCE(contacts.name, excluded.name),
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .bind(newId("ct"), input.channel, input.externalId, input.name ?? null, now, now)
      .first<Row>();
    if (!row) throw new Error("No se pudo guardar el contacto");
    return toContact(row);
  }

  async getContact(id: string): Promise<ContactRecord | null> {
    const row = await this.db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first<Row>();
    return row ? toContact(row) : null;
  }

  async findContact(channel: Channel, externalId: string): Promise<ContactRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM contacts WHERE channel = ? AND external_id = ?")
      .bind(channel, externalId)
      .first<Row>();
    return row ? toContact(row) : null;
  }

  async updateContact(
    id: string,
    patch: { name?: string; phone?: string; email?: string },
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE contacts SET
           name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), updated_at = ?
         WHERE id = ?`,
      )
      .bind(patch.name ?? null, patch.phone ?? null, patch.email ?? null, this.clock(), id)
      .run();
  }

  // ---------- conversaciones ----------

  async findOpenConversation(
    contactId: string,
    channel: Channel,
  ): Promise<ConversationRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM conversations WHERE contact_id = ? AND channel = ? AND status = 'open'
         ORDER BY last_message_at DESC LIMIT 1`,
      )
      .bind(contactId, channel)
      .first<Row>();
    return row ? toConversation(row) : null;
  }

  async createConversation(input: {
    contactId: string;
    channel: Channel;
  }): Promise<ConversationRecord> {
    const now = this.clock();
    const row = await this.db
      .prepare(
        `INSERT INTO conversations (id, contact_id, channel, last_message_at, created_at)
         VALUES (?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(newId("cv"), input.contactId, input.channel, now, now)
      .first<Row>();
    if (!row) throw new Error("No se pudo crear la conversación");
    return toConversation(row);
  }

  async getConversation(id: string): Promise<ConversationRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .bind(id)
      .first<Row>();
    return row ? toConversation(row) : null;
  }

  async updateConversation(id: string, patch: ConversationPatch): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(CONVERSATION_COLUMNS) as [
      keyof ConversationPatch,
      string,
    ][]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      sets.push(`${column} = ?`);
      values.push(typeof value === "boolean" ? (value ? 1 : 0) : (value ?? null));
    }
    if (sets.length === 0) return;
    await this.db
      .prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  async listConversations(
    filter: ConversationFilter,
    limit: number,
    search?: string,
  ): Promise<ConversationListRow[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (filter === "needs_human") where.push("cv.needs_human = 1");
    if (filter === "unread") where.push("cv.unread > 0");
    if (filter === "leads")
      where.push("EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = cv.contact_id)");
    if (search?.trim()) {
      const like = `%${escapeLike(search.trim())}%`;
      where.push(
        "(ct.name LIKE ? ESCAPE '\\' OR ct.external_id LIKE ? ESCAPE '\\' OR cv.last_message_preview LIKE ? ESCAPE '\\')",
      );
      values.push(like, like, like);
    }
    const sql = `${CONVERSATION_ROW_SELECT}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY cv.last_message_at DESC LIMIT ?`;
    const { results } = await this.db
      .prepare(sql)
      .bind(...values, limit)
      .all<Row>();
    return results.map(toConversationRow);
  }

  async getConversationRow(id: string): Promise<ConversationListRow | null> {
    const row = await this.db
      .prepare(`${CONVERSATION_ROW_SELECT} WHERE cv.id = ?`)
      .bind(id)
      .first<Row>();
    return row ? toConversationRow(row) : null;
  }

  // ---------- mensajes ----------

  async addMessage(input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    meta?: Record<string, unknown> | null;
  }): Promise<MessageRecord> {
    const row = await this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        newId("msg"),
        input.conversationId,
        input.role,
        input.content,
        input.meta ? JSON.stringify(input.meta) : null,
        this.clock(),
      )
      .first<Row>();
    if (!row) throw new Error("No se pudo guardar el mensaje");
    return toMessage(row);
  }

  async listMessages(conversationId: string, limit: number): Promise<MessageRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM (
           SELECT *, rowid AS seq FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         ) ORDER BY created_at ASC, seq ASC`,
      )
      .bind(conversationId, limit)
      .all<Row>();
    return results.map(toMessage);
  }

  async listMessagesSince(conversationId: string, since: number): Promise<MessageRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC, rowid ASC LIMIT 200",
      )
      .bind(conversationId, since)
      .all<Row>();
    return results.map(toMessage);
  }

  async countCustomerMessages(conversationId: string, since = 0): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'user' AND created_at >= ?",
      )
      .bind(conversationId, since)
      .first<Row>();
    return num(row?.n);
  }

  // ---------- leads ----------

  async upsertLead(input: LeadInput): Promise<LeadRecord> {
    const now = this.clock();
    await this.db
      .prepare(
        `INSERT INTO leads (id, contact_id, conversation_id, name, phone, email, interest, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (contact_id) DO UPDATE SET
           conversation_id = COALESCE(excluded.conversation_id, leads.conversation_id),
           name = COALESCE(excluded.name, leads.name),
           phone = COALESCE(excluded.phone, leads.phone),
           email = COALESCE(excluded.email, leads.email),
           interest = COALESCE(excluded.interest, leads.interest),
           updated_at = excluded.updated_at`,
      )
      .bind(
        newId("ld"),
        input.contactId,
        input.conversationId,
        input.name ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.interest ?? null,
        now,
        now,
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT l.*, ct.channel FROM leads l JOIN contacts ct ON ct.id = l.contact_id WHERE l.contact_id = ?",
      )
      .bind(input.contactId)
      .first<Row>();
    if (!row) throw new Error("No se pudo guardar el lead");
    return toLead(row);
  }

  async listLeads(limit: number): Promise<LeadRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT l.*, ct.channel FROM leads l JOIN contacts ct ON ct.id = l.contact_id ORDER BY l.created_at DESC LIMIT ?",
      )
      .bind(limit)
      .all<Row>();
    return results.map(toLead);
  }

  async updateLead(
    id: string,
    patch: { status?: LeadStatus; notes?: string },
  ): Promise<LeadRecord | null> {
    await this.db
      .prepare(
        "UPDATE leads SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?",
      )
      .bind(patch.status ?? null, patch.notes ?? null, this.clock(), id)
      .run();
    const row = await this.db
      .prepare(
        "SELECT l.*, ct.channel FROM leads l JOIN contacts ct ON ct.id = l.contact_id WHERE l.id = ?",
      )
      .bind(id)
      .first<Row>();
    return row ? toLead(row) : null;
  }

  // ---------- tickets ----------

  async createTicket(input: {
    conversationId: string | null;
    kind: TicketKind;
    reason: string;
  }): Promise<TicketRecord> {
    const row = await this.db
      .prepare(
        "INSERT INTO tickets (id, conversation_id, kind, reason, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
      )
      .bind(newId("tk"), input.conversationId, input.kind, input.reason, this.clock())
      .first<Row>();
    if (!row) throw new Error("No se pudo crear el ticket");
    return toTicket(row);
  }

  async findOpenTicket(conversationId: string, kind: TicketKind): Promise<TicketRecord | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM tickets WHERE conversation_id = ? AND kind = ? AND status = 'open' LIMIT 1",
      )
      .bind(conversationId, kind)
      .first<Row>();
    return row ? toTicket(row) : null;
  }

  async listTickets(status: "open" | "resolved" | "all", limit: number): Promise<TicketRecord[]> {
    const stmt =
      status === "all"
        ? this.db.prepare("SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?").bind(limit)
        : this.db
            .prepare("SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT ?")
            .bind(status, limit);
    const { results } = await stmt.all<Row>();
    return results.map(toTicket);
  }

  async resolveTicket(id: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        "UPDATE tickets SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'",
      )
      .bind(this.clock(), id)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  // ---------- uso y métricas ----------

  async recordUsage(input: UsageInput): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO llm_usage (id, conversation_id, provider, model, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("use"),
        input.conversationId,
        input.provider,
        input.model,
        Math.round(input.inputTokens),
        Math.round(input.outputTokens),
        Math.round(input.cacheReadTokens),
        Math.round(input.cacheWriteTokens),
        input.costUsd,
        this.clock(),
      )
      .run();
  }

  async exportMessages(limit: number): Promise<ExportMessageRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT m.conversation_id, cv.channel, ct.id AS contact_id, ct.name AS contact_name,
                ct.external_id AS contact_external_id, m.role, m.content, m.created_at
         FROM messages m
         JOIN conversations cv ON cv.id = m.conversation_id
         JOIN contacts ct ON ct.id = cv.contact_id
         ORDER BY m.conversation_id, m.created_at, m.rowid
         LIMIT ?`,
      )
      .bind(limit)
      .all<Row>();
    return results.map((r) => ({
      conversationId: String(r.conversation_id),
      channel: String(r.channel) as Channel,
      contactId: String(r.contact_id),
      contactName: str(r.contact_name),
      contactExternalId: String(r.contact_external_id),
      role: String(r.role) as MessageRole,
      content: String(r.content),
      createdAt: num(r.created_at),
    }));
  }

  async summary(now: number): Promise<SummaryDto> {
    const d1 = now - DAY;
    const d30 = now - 30 * DAY;
    const date = new Date(now);
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);

    const [conv24, msg24, contacts30, leads30, tickets, needsHuman, resolved, cost] =
      await this.db.batch<Row>([
        this.db
          .prepare(
            "SELECT COUNT(DISTINCT conversation_id) AS n FROM messages WHERE role = 'user' AND created_at >= ?",
          )
          .bind(d1),
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM messages WHERE role IN ('user','assistant','human') AND created_at >= ?",
          )
          .bind(d1),
        this.db
          .prepare(
            "SELECT COUNT(DISTINCT contact_id) AS n FROM conversations WHERE last_message_at >= ?",
          )
          .bind(d30),
        this.db.prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?").bind(d30),
        this.db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"),
        this.db.prepare(
          "SELECT COUNT(*) AS n FROM conversations WHERE needs_human = 1 AND status = 'open'",
        ),
        this.db
          .prepare(
            `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.role = 'human')
                            OR EXISTS (SELECT 1 FROM tickets t WHERE t.conversation_id = cv.id AND t.kind = 'handoff')
                       THEN 1 ELSE 0 END) AS with_human
           FROM conversations cv WHERE cv.last_message_at >= ?`,
          )
          .bind(d30),
        this.db
          .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS n FROM llm_usage WHERE created_at >= ?")
          .bind(monthStart),
      ]);

    const first = (r: D1Result<Row> | undefined): Row => r?.results[0] ?? {};
    const total = num(first(resolved).total);
    const withHuman = num(first(resolved).with_human);

    return {
      conversations24h: num(first(conv24).n),
      messages24h: num(first(msg24).n),
      uniqueContacts30d: num(first(contacts30).n),
      newLeads30d: num(first(leads30).n),
      openTickets: num(first(tickets).n),
      needsHuman: num(first(needsHuman).n),
      resolvedWithoutHumanPct: total === 0 ? 0 : Math.round(((total - withHuman) / total) * 100),
      costMonthUsd: Math.round(num(first(cost).n) * 10_000) / 10_000,
    };
  }

  // ---------- intentos de login ----------

  async getLoginAttempt(
    key: string,
  ): Promise<{ failures: number; lockedUntil: number | null } | null> {
    const row = await this.db
      .prepare("SELECT * FROM login_attempts WHERE key = ?")
      .bind(key)
      .first<Row>();
    return row ? { failures: num(row.failures), lockedUntil: numOrNull(row.locked_until) } : null;
  }

  async saveLoginAttempt(key: string, failures: number, lockedUntil: number | null): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`,
      )
      .bind(key, failures, lockedUntil, this.clock())
      .run();
  }

  async clearLoginAttempt(key: string): Promise<void> {
    await this.db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
  }
}
