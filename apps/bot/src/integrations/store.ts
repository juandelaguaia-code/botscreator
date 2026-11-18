import type {
  AppointmentDto,
  CampaignDto,
  CampaignInput,
  Channel,
  GalleryItemDto,
  PaymentDto,
} from "@yunque/core";
import { newId } from "../lib/crypto.js";

type Row = Record<string, unknown>;
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface GalleryRecord extends Omit<GalleryItemDto, "url"> {
  objectKey: string;
}

export interface CampaignRecipient {
  contactId: string;
  channel: Channel;
  externalId: string;
  name: string | null;
  lastCustomerMessageAt: number | null;
}

function toGallery(r: Row): GalleryRecord {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    kind: String(r.kind) as GalleryRecord["kind"],
    contentType: String(r.content_type),
    size: num(r.size),
    objectKey: String(r.object_key),
    createdAt: num(r.created_at),
  };
}

function toPayment(r: Row): PaymentDto & { contactId: string; sessionId: string } {
  return {
    id: String(r.id),
    conversationId: str(r.conversation_id),
    contactId: String(r.contact_id),
    sessionId: String(r.session_id),
    concept: String(r.concept),
    amount: num(r.amount),
    currency: String(r.currency),
    url: String(r.url),
    status: String(r.status) as PaymentDto["status"],
    createdAt: num(r.created_at),
    paidAt: r.paid_at === null ? null : num(r.paid_at),
  };
}

/** Persistencia de agenda, cobros, galería y campañas. */
export class IntegrationsStore {
  constructor(
    private readonly db: D1Database,
    private readonly clock: () => number = Date.now,
  ) {}

  // ---------- agenda ----------

  async saveAppointment(input: {
    conversationId: string;
    contactId: string;
    provider: string;
    externalId: string;
    startAt: number;
    attendeeName: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO appointments (id, conversation_id, contact_id, provider, external_id, start_at, attendee_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("apt"),
        input.conversationId,
        input.contactId,
        input.provider,
        input.externalId,
        input.startAt,
        input.attendeeName,
        this.clock(),
      )
      .run();
  }

  async listAppointments(since: number): Promise<AppointmentDto[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM appointments WHERE start_at >= ? ORDER BY start_at LIMIT 200")
      .bind(since)
      .all<Row>();
    return results.map((r) => ({
      id: String(r.id),
      conversationId: str(r.conversation_id),
      attendeeName: str(r.attendee_name),
      startAt: num(r.start_at),
      status: String(r.status) as AppointmentDto["status"],
      remindedAt: r.reminded_at === null ? null : num(r.reminded_at),
    }));
  }

  /** Citas confirmadas que empiezan en la ventana del recordatorio y no se han recordado. */
  async dueReminders(from: number, to: number) {
    const { results } = await this.db
      .prepare(
        `SELECT a.id, a.start_at, a.attendee_name, a.conversation_id, ct.channel, ct.external_id, cv.last_customer_message_at
         FROM appointments a
         JOIN contacts ct ON ct.id = a.contact_id
         LEFT JOIN conversations cv ON cv.id = a.conversation_id
         WHERE a.status = 'confirmed' AND a.reminded_at IS NULL AND a.start_at BETWEEN ? AND ?
         LIMIT 50`,
      )
      .bind(from, to)
      .all<Row>();
    return results.map((r) => ({
      id: String(r.id),
      startAt: num(r.start_at),
      attendeeName: str(r.attendee_name),
      conversationId: str(r.conversation_id),
      channel: String(r.channel) as Channel,
      externalId: String(r.external_id),
      lastCustomerMessageAt:
        r.last_customer_message_at === null ? null : num(r.last_customer_message_at),
    }));
  }

  async markReminded(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE appointments SET reminded_at = ? WHERE id = ?")
      .bind(this.clock(), id)
      .run();
  }

  // ---------- cobros ----------

  async savePayment(input: {
    conversationId: string;
    contactId: string;
    sessionId: string;
    concept: string;
    amount: number;
    currency: string;
    url: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO payments (id, conversation_id, contact_id, provider, session_id, concept, amount, currency, url, created_at)
         VALUES (?, ?, ?, 'stripe', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("pay"),
        input.conversationId,
        input.contactId,
        input.sessionId,
        input.concept,
        input.amount,
        input.currency,
        input.url,
        this.clock(),
      )
      .run();
  }

  async paymentBySession(sessionId: string) {
    const r = await this.db
      .prepare("SELECT * FROM payments WHERE session_id = ?")
      .bind(sessionId)
      .first<Row>();
    return r ? toPayment(r) : null;
  }

  /** Marca pagado; devuelve false si ya lo estaba (los webhooks pueden repetirse). */
  async markPaid(sessionId: string): Promise<boolean> {
    const res = await this.db
      .prepare(
        "UPDATE payments SET status = 'paid', paid_at = ? WHERE session_id = ? AND status != 'paid'",
      )
      .bind(this.clock(), sessionId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }

  async listPayments(): Promise<PaymentDto[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM payments ORDER BY created_at DESC LIMIT 200")
      .all<Row>();
    return results.map((r) => {
      const { contactId: _c, sessionId: _s, ...dto } = toPayment(r);
      return dto;
    });
  }

  // ---------- galería ----------

  async saveGalleryItem(input: Omit<GalleryRecord, "id" | "createdAt">): Promise<GalleryRecord> {
    const row = await this.db
      .prepare(
        `INSERT INTO gallery_items (id, name, description, kind, content_type, object_key, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        newId("gal"),
        input.name,
        input.description,
        input.kind,
        input.contentType,
        input.objectKey,
        input.size,
        this.clock(),
      )
      .first<Row>();
    if (!row) throw new Error("No se pudo guardar el archivo");
    return toGallery(row);
  }

  async listGallery(): Promise<GalleryRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM gallery_items ORDER BY name")
      .all<Row>();
    return results.map(toGallery);
  }

  async galleryByKey(key: string): Promise<GalleryRecord | null> {
    const r = await this.db
      .prepare("SELECT * FROM gallery_items WHERE object_key = ?")
      .bind(key)
      .first<Row>();
    return r ? toGallery(r) : null;
  }

  async deleteGalleryItem(id: string): Promise<GalleryRecord | null> {
    const r = await this.db
      .prepare("DELETE FROM gallery_items WHERE id = ? RETURNING *")
      .bind(id)
      .first<Row>();
    return r ? toGallery(r) : null;
  }

  // ---------- campañas ----------

  async createCampaign(input: CampaignInput): Promise<string> {
    const id = newId("cmp");
    await this.db
      .prepare(
        "INSERT INTO campaigns (id, name, message, segment, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(id, input.name, input.message, JSON.stringify(input.segment), this.clock())
      .run();
    return id;
  }

  async getCampaign(
    id: string,
  ): Promise<(CampaignInput & { id: string; status: CampaignDto["status"] }) | null> {
    const r = await this.db.prepare("SELECT * FROM campaigns WHERE id = ?").bind(id).first<Row>();
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      message: String(r.message),
      segment: JSON.parse(String(r.segment)) as CampaignInput["segment"],
      status: String(r.status) as CampaignDto["status"],
    };
  }

  async listCampaigns(): Promise<CampaignDto[]> {
    const { results } = await this.db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'sent') AS sent,
           (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'failed') AS failed,
           (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.status = 'skipped') AS skipped
         FROM campaigns c ORDER BY c.created_at DESC LIMIT 100`,
      )
      .all<Row>();
    const out: CampaignDto[] = [];
    for (const r of results) {
      const segment = JSON.parse(String(r.segment)) as CampaignInput["segment"];
      const pending = (await this.campaignRecipients(String(r.id), segment, 100_000)).length;
      const sent = num(r.sent);
      const failed = num(r.failed);
      const skipped = num(r.skipped);
      out.push({
        id: String(r.id),
        name: String(r.name),
        message: String(r.message),
        segment,
        status: String(r.status) as CampaignDto["status"],
        recipients: pending + sent + failed + skipped,
        sent,
        failed,
        skipped,
        createdAt: num(r.created_at),
      });
    }
    return out;
  }

  async setCampaignStatus(id: string, status: CampaignDto["status"]): Promise<void> {
    const column =
      status === "sending" ? ", started_at = ?" : status === "done" ? ", finished_at = ?" : "";
    const stmt = this.db.prepare(`UPDATE campaigns SET status = ?${column} WHERE id = ?`);
    await (column ? stmt.bind(status, this.clock(), id) : stmt.bind(status, id)).run();
  }

  async sendingCampaigns(): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT id FROM campaigns WHERE status = 'sending'")
      .all<Row>();
    return results.map((r) => String(r.id));
  }

  /** Contactos del segmento que aún no recibieron esta campaña. */
  async campaignRecipients(
    campaignId: string,
    segment: CampaignInput["segment"],
    limit: number,
  ): Promise<CampaignRecipient[]> {
    const channels = segment.channels.map(() => "?").join(", ");
    const statuses = segment.statuses.length
      ? `AND EXISTS (SELECT 1 FROM leads l WHERE l.contact_id = ct.id AND l.status IN (${segment.statuses.map(() => "?").join(", ")}))`
      : "";
    const { results } = await this.db
      .prepare(
        `SELECT ct.id, ct.channel, ct.external_id, ct.name,
                (SELECT MAX(cv.last_customer_message_at) FROM conversations cv WHERE cv.contact_id = ct.id) AS last_customer
         FROM contacts ct
         WHERE ct.channel IN (${channels}) ${statuses}
           AND EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = ct.id)
           AND NOT EXISTS (SELECT 1 FROM campaign_sends s WHERE s.campaign_id = ? AND s.contact_id = ct.id)
         LIMIT ?`,
      )
      .bind(...segment.channels, ...segment.statuses, campaignId, limit)
      .all<Row>();
    return results.map((r) => ({
      contactId: String(r.id),
      channel: String(r.channel) as Channel,
      externalId: String(r.external_id),
      name: str(r.name),
      lastCustomerMessageAt: r.last_customer === null ? null : num(r.last_customer),
    }));
  }

  async recordCampaignSend(
    campaignId: string,
    contactId: string,
    status: "sent" | "failed" | "skipped",
    detail?: string,
  ) {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO campaign_sends (campaign_id, contact_id, status, detail, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(campaignId, contactId, status, detail?.slice(0, 300) ?? null, this.clock())
      .run();
  }
}
