import type { Channel } from "@yunque/core";
import { newId } from "../lib/crypto.js";

type Row = Record<string, unknown>;
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export type OutreachKind = "cazador" | "encuesta" | "no_show" | "resena" | "campana";

export interface Insight {
  rating: number;
  sentiment: "positivo" | "neutral" | "negativo";
  resolvedWithoutHuman: boolean;
  openSale: boolean;
  upset: boolean;
  intent: string;
  objection: string;
  unansweredQuestion: string;
  summary: string;
}

export interface ClosedConversation {
  id: string;
  contactId: string;
  channel: Channel;
  lastCustomerMessageAt: number | null;
  needsHuman: boolean;
}

export interface OutreachCandidate {
  conversationId: string;
  contactId: string;
  channel: Channel;
  externalId: string;
  name: string | null;
  lastCustomerMessageAt: number;
}

/** Canales donde el bot puede escribir primero (el chat web no: el visitante ya no está). */
export const PUSH_CHANNELS: Channel[] = ["whatsapp", "telegram", "instagram", "messenger"];
const PUSH_SQL = PUSH_CHANNELS.map((c) => `'${c}'`).join(", ");

export class AutomationStore {
  constructor(
    private readonly db: D1Database,
    private readonly clock: () => number = Date.now,
  ) {}

  // ---------- cierre de conversaciones y Vigilante ----------

  /** Cierra las conversaciones en silencio desde antes de `before` (lote acotado). */
  async closeIdle(before: number, limit: number): Promise<ClosedConversation[]> {
    const { results } = await this.db
      .prepare(
        `UPDATE conversations SET status = 'closed', closed_at = ?
         WHERE id IN (
           SELECT id FROM conversations WHERE status = 'open' AND last_message_at < ? AND channel != 'playground'
           ORDER BY last_message_at LIMIT ?
         )
         RETURNING id, contact_id, channel, last_customer_message_at, needs_human`,
      )
      .bind(this.clock(), before, limit)
      .all<Row>();
    return results.map((r) => ({
      id: String(r.id),
      contactId: String(r.contact_id),
      channel: String(r.channel) as Channel,
      lastCustomerMessageAt:
        r.last_customer_message_at === null ? null : num(r.last_customer_message_at),
      needsHuman: num(r.needs_human) === 1,
    }));
  }

  async saveInsight(conversationId: string, insight: Insight, model: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO conversation_insights (conversation_id, rating, sentiment, resolved_without_human,
           open_sale, upset, intent, objection, unanswered_question, summary, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        conversationId,
        insight.rating,
        insight.sentiment,
        insight.resolvedWithoutHuman ? 1 : 0,
        insight.openSale ? 1 : 0,
        insight.upset ? 1 : 0,
        insight.intent || null,
        insight.objection || null,
        insight.unansweredQuestion || null,
        insight.summary,
        model,
        this.clock(),
      )
      .run();
  }

  async getInsight(conversationId: string): Promise<Insight | null> {
    const r = await this.db
      .prepare("SELECT * FROM conversation_insights WHERE conversation_id = ?")
      .bind(conversationId)
      .first<Row>();
    if (!r) return null;
    return {
      rating: num(r.rating),
      sentiment: String(r.sentiment) as Insight["sentiment"],
      resolvedWithoutHuman: num(r.resolved_without_human) === 1,
      openSale: num(r.open_sale) === 1,
      upset: num(r.upset) === 1,
      intent: str(r.intent) ?? "",
      objection: str(r.objection) ?? "",
      unansweredQuestion: str(r.unanswered_question) ?? "",
      summary: String(r.summary),
    };
  }

  async getContactMemory(contactId: string): Promise<string | null> {
    const r = await this.db
      .prepare("SELECT memory FROM contacts WHERE id = ?")
      .bind(contactId)
      .first<Row>();
    return str(r?.memory);
  }

  async setContactMemory(contactId: string, memory: string): Promise<void> {
    await this.db
      .prepare("UPDATE contacts SET memory = ? WHERE id = ?")
      .bind(memory.slice(0, 1500), contactId)
      .run();
  }

  // ---------- mensajes proactivos ----------

  /**
   * Reserva un envío proactivo. Devuelve `null` si ya existía (los índices únicos garantizan un
   * toque por conversación o por cliente, aunque dos crons corran a la vez).
   */
  async claimOutreach(input: {
    kind: OutreachKind;
    conversationId: string | null;
    contactId: string;
    detail?: string;
  }): Promise<string | null> {
    const row = await this.db
      .prepare(
        `INSERT OR IGNORE INTO outreach (id, kind, conversation_id, contact_id, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .bind(
        newId("out"),
        input.kind,
        input.conversationId,
        input.contactId,
        input.detail ?? null,
        this.clock(),
      )
      .first<Row>();
    return row ? String(row.id) : null;
  }

  async markOutreachFailed(id: string, detail: string): Promise<void> {
    await this.db
      .prepare("UPDATE outreach SET status = 'failed', detail = ? WHERE id = ?")
      .bind(detail.slice(0, 500), id)
      .run();
  }

  async countOutreachSince(kind: OutreachKind, since: number): Promise<number> {
    const r = await this.db
      .prepare("SELECT COUNT(*) AS n FROM outreach WHERE kind = ? AND created_at >= ?")
      .bind(kind, since)
      .first<Row>();
    return num(r?.n);
  }

  async hasOutreach(kind: OutreachKind, contactId: string): Promise<boolean> {
    const r = await this.db
      .prepare("SELECT 1 AS x FROM outreach WHERE kind = ? AND contact_id = ? LIMIT 1")
      .bind(kind, contactId)
      .first<Row>();
    return Boolean(r);
  }

  /**
   * Cazador: venta abierta (según el Vigilante) o 4+ mensajes del cliente; el último en hablar fue
   * el negocio; último mensaje del cliente entre 3 y 20 h; sin pausa ni pedido de humano; nunca
   * tocada antes.
   */
  async hunterCandidates(now: number, limit: number): Promise<OutreachCandidate[]> {
    if (limit <= 0) return [];
    const { results } = await this.db
      .prepare(
        `SELECT cv.id, cv.contact_id, cv.channel, cv.last_customer_message_at, ct.external_id, ct.name
         FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id
         WHERE cv.channel IN (${PUSH_SQL})
           AND cv.needs_human = 0
           AND (cv.paused_until IS NULL OR cv.paused_until < ?)
           AND cv.last_customer_message_at BETWEEN ? AND ?
           AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.conversation_id = cv.id AND o.kind = 'cazador')
           AND (SELECT m.role FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) != 'user'
           AND (
             EXISTS (SELECT 1 FROM conversation_insights i WHERE i.conversation_id = cv.id AND i.open_sale = 1)
             OR (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id AND m.role = 'user') >= 4
           )
         ORDER BY cv.last_customer_message_at DESC
         LIMIT ?`,
      )
      .bind(now, now - 20 * 3_600_000, now - 3 * 3_600_000, limit)
      .all<Row>();
    return results.map(toCandidate);
  }

  /**
   * Recupera no-shows: leads que siguen "nuevos", con su última conversación enfriada hace entre
   * `afterDays` y 14 días, sin pedido de humano pendiente y nunca rescatados.
   */
  async noShowCandidates(
    now: number,
    afterDays: number,
    limit: number,
  ): Promise<OutreachCandidate[]> {
    const { results } = await this.db
      .prepare(
        `SELECT cv.id, cv.contact_id, cv.channel, cv.last_customer_message_at, ct.external_id, ct.name
         FROM leads l
         JOIN contacts ct ON ct.id = l.contact_id
         JOIN conversations cv ON cv.id = l.conversation_id
         WHERE l.status = 'nuevo'
           AND cv.channel IN ('whatsapp', 'telegram')
           AND cv.needs_human = 0
           AND cv.last_customer_message_at BETWEEN ? AND ?
           AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.contact_id = ct.id AND o.kind = 'no_show')
         ORDER BY cv.last_customer_message_at DESC
         LIMIT ?`,
      )
      .bind(now - 14 * 86_400_000, now - afterDays * 86_400_000, limit)
      .all<Row>();
    return results.map(toCandidate);
  }

  // ---------- encuestas ----------

  /** Encuesta enviada a este cliente en las últimas 24 h y todavía sin respuesta. */
  async pendingSurvey(
    contactId: string,
    since: number,
  ): Promise<{ conversationId: string } | null> {
    const r = await this.db
      .prepare(
        `SELECT o.conversation_id FROM outreach o
         WHERE o.kind = 'encuesta' AND o.contact_id = ? AND o.status = 'sent' AND o.created_at >= ?
           AND NOT EXISTS (SELECT 1 FROM survey_responses s WHERE s.conversation_id = o.conversation_id)
         ORDER BY o.created_at DESC LIMIT 1`,
      )
      .bind(contactId, since)
      .first<Row>();
    return r?.conversation_id ? { conversationId: String(r.conversation_id) } : null;
  }

  async recordSurvey(input: {
    conversationId: string;
    contactId: string;
    rating: number;
    comment?: string;
  }): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO survey_responses (id, conversation_id, contact_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        newId("srv"),
        input.conversationId,
        input.contactId,
        input.rating,
        input.comment ?? null,
        this.clock(),
      )
      .run();
  }

  // ---------- salud y costos ----------

  async countAiFailuresSince(since: number): Promise<number> {
    const r = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM tickets WHERE kind = 'system' AND reason LIKE 'Falla de IA%' AND created_at >= ?",
      )
      .bind(since)
      .first<Row>();
    return num(r?.n);
  }

  async costSince(since: number): Promise<number> {
    const r = await this.db
      .prepare("SELECT COALESCE(SUM(cost_usd), 0) AS n FROM llm_usage WHERE created_at >= ?")
      .bind(since)
      .first<Row>();
    return num(r?.n);
  }

  /** Números de un rango para el reporte nocturno. */
  async periodReport(since: number, until: number) {
    const [conv, leads, handoffs, upset, sales, surveys, cost] = await this.db.batch<Row>([
      this.db
        .prepare(
          "SELECT COUNT(DISTINCT conversation_id) AS n, COUNT(*) AS m FROM messages WHERE role = 'user' AND created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
      this.db
        .prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at BETWEEN ? AND ?")
        .bind(since, until),
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM tickets WHERE kind = 'handoff' AND created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM conversation_insights WHERE upset = 1 AND created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM conversation_insights WHERE open_sale = 1 AND created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
      this.db
        .prepare(
          "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM survey_responses WHERE created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
      this.db
        .prepare(
          "SELECT COALESCE(SUM(cost_usd), 0) AS n FROM llm_usage WHERE created_at BETWEEN ? AND ?",
        )
        .bind(since, until),
    ]);
    const first = (r: D1Result<Row> | undefined): Row => r?.results[0] ?? {};
    return {
      conversations: num(first(conv).n),
      customerMessages: num(first(conv).m),
      newLeads: num(first(leads).n),
      handoffs: num(first(handoffs).n),
      upsetCustomers: num(first(upset).n),
      openSales: num(first(sales).n),
      surveys: num(first(surveys).n),
      surveyAverage:
        first(surveys).avg === null ? null : Math.round(num(first(surveys).avg) * 10) / 10,
      costUsd: Math.round(num(first(cost).n) * 10_000) / 10_000,
    };
  }
}

function toCandidate(r: Row): OutreachCandidate {
  return {
    conversationId: String(r.id),
    contactId: String(r.contact_id),
    channel: String(r.channel) as Channel,
    externalId: String(r.external_id),
    name: str(r.name),
    lastCustomerMessageAt: num(r.last_customer_message_at),
  };
}
