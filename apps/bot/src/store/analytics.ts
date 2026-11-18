import type { CostsDto, InsightDto, InsightsDto, StatsDto } from "@yunque/core";

type Row = Record<string, unknown>;
const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const DAY = 86_400_000;
const DAY_SQL = "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')";

function dayKeys(since: number, now: number): string[] {
  const keys: string[] = [];
  for (let t = since; t <= now; t += DAY) keys.push(new Date(t).toISOString().slice(0, 10));
  const today = new Date(now).toISOString().slice(0, 10);
  if (keys.at(-1) !== today) keys.push(today);
  return keys;
}

/** Lecturas para las pestañas Estadísticas, Costos y Analista. Solo consultas, nada se escribe. */
export class AnalyticsStore {
  constructor(private readonly db: D1Database) {}

  async stats(days: number, now: number): Promise<StatsDto> {
    const since = now - (days - 1) * DAY;
    const sinceDay = Date.UTC(
      new Date(since).getUTCFullYear(),
      new Date(since).getUTCMonth(),
      new Date(since).getUTCDate(),
    );
    const [conv, leads, handoffs, cost, ratings] = await this.db.batch<Row>([
      this.db
        .prepare(
          `SELECT ${DAY_SQL} AS day, COUNT(DISTINCT conversation_id) AS conversations, COUNT(*) AS messages
           FROM messages WHERE role = 'user' AND created_at >= ? GROUP BY day`,
        )
        .bind(sinceDay),
      this.db
        .prepare(
          `SELECT ${DAY_SQL} AS day, COUNT(*) AS n FROM leads WHERE created_at >= ? GROUP BY day`,
        )
        .bind(sinceDay),
      this.db
        .prepare(
          `SELECT ${DAY_SQL} AS day, COUNT(*) AS n FROM tickets WHERE kind = 'handoff' AND created_at >= ? GROUP BY day`,
        )
        .bind(sinceDay),
      this.db
        .prepare(
          `SELECT ${DAY_SQL} AS day, SUM(cost_usd) AS n FROM llm_usage WHERE created_at >= ? GROUP BY day`,
        )
        .bind(sinceDay),
      this.db
        .prepare(
          "SELECT COUNT(*) AS n, AVG(rating) AS avg FROM conversation_insights WHERE created_at >= ?",
        )
        .bind(sinceDay),
    ]);
    const byDay = (r: D1Result<Row> | undefined, field = "n") =>
      new Map((r?.results ?? []).map((x) => [String(x.day), num(x[field])]));
    const c = byDay(conv, "conversations");
    const m = byDay(conv, "messages");
    const l = byDay(leads);
    const h = byDay(handoffs);
    const k = byDay(cost);
    const series = dayKeys(sinceDay, now).map((day) => ({
      day,
      conversations: c.get(day) ?? 0,
      messages: m.get(day) ?? 0,
      leads: l.get(day) ?? 0,
      handoffs: h.get(day) ?? 0,
      costUsd: Math.round((k.get(day) ?? 0) * 10_000) / 10_000,
    }));
    const r = ratings?.results[0] ?? {};
    const returningContacts = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM (SELECT contact_id FROM conversations WHERE created_at >= ? GROUP BY contact_id HAVING COUNT(*) > 1)",
      )
      .bind(sinceDay)
      .first<Row>();
    const contacts = await this.db
      .prepare("SELECT COUNT(DISTINCT contact_id) AS n FROM conversations WHERE created_at >= ?")
      .bind(sinceDay)
      .first<Row>();
    return {
      days,
      series,
      averageRating:
        r.avg === null || r.avg === undefined ? null : Math.round(num(r.avg) * 10) / 10,
      analyzed: num(r.n),
      contacts: num(contacts?.n),
      returningContacts: num(returningContacts?.n),
    };
  }

  async costs(now: number, budgetUsd: number | null): Promise<CostsDto> {
    const d = new Date(now);
    const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const [byModel, byDay] = await this.db.batch<Row>([
      this.db
        .prepare(
          `SELECT provider, model, COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
                  SUM(cache_read_tokens) AS cache_read, SUM(cost_usd) AS cost
           FROM llm_usage WHERE created_at >= ? GROUP BY provider, model ORDER BY cost DESC`,
        )
        .bind(monthStart),
      this.db
        .prepare(
          `SELECT ${DAY_SQL} AS day, SUM(cost_usd) AS cost FROM llm_usage WHERE created_at >= ? GROUP BY day ORDER BY day`,
        )
        .bind(monthStart),
    ]);
    const models = (byModel?.results ?? []).map((x) => ({
      provider: String(x.provider),
      model: String(x.model),
      calls: num(x.calls),
      inputTokens: num(x.input),
      outputTokens: num(x.output),
      cacheReadTokens: num(x.cache_read),
      costUsd: Math.round(num(x.cost) * 10_000) / 10_000,
    }));
    const monthUsd = models.reduce((s, x) => s + x.costUsd, 0);
    const dayOfMonth = d.getUTCDate();
    return {
      monthUsd: Math.round(monthUsd * 10_000) / 10_000,
      projectedUsd: Math.round((monthUsd / dayOfMonth) * daysInMonth * 100) / 100,
      budgetUsd,
      byModel: models,
      byDay: (byDay?.results ?? []).map((x) => ({
        day: String(x.day),
        costUsd: Math.round(num(x.cost) * 10_000) / 10_000,
      })),
    };
  }

  async insights(
    filter: "all" | "upset" | "open_sale" | "low",
    limit: number,
  ): Promise<InsightsDto> {
    const where =
      filter === "upset"
        ? "WHERE i.upset = 1"
        : filter === "open_sale"
          ? "WHERE i.open_sale = 1"
          : filter === "low"
            ? "WHERE i.rating <= 2"
            : "";
    const { results } = await this.db
      .prepare(
        `SELECT i.*, cv.channel, ct.name AS contact_name, ct.external_id
         FROM conversation_insights i
         JOIN conversations cv ON cv.id = i.conversation_id
         JOIN contacts ct ON ct.id = cv.contact_id
         ${where} ORDER BY i.created_at DESC LIMIT ?`,
      )
      .bind(limit)
      .all<Row>();
    const items: InsightDto[] = results.map((r) => ({
      conversationId: String(r.conversation_id),
      channel: String(r.channel) as InsightDto["channel"],
      contactName: str(r.contact_name),
      contactExternalId: String(r.external_id),
      rating: num(r.rating),
      sentiment: String(r.sentiment) as InsightDto["sentiment"],
      resolvedWithoutHuman: num(r.resolved_without_human) === 1,
      openSale: num(r.open_sale) === 1,
      upset: num(r.upset) === 1,
      intent: str(r.intent),
      objection: str(r.objection),
      unansweredQuestion: str(r.unanswered_question),
      summary: String(r.summary),
      createdAt: num(r.created_at),
    }));
    const agg = await this.db
      .prepare(
        `SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(upset) AS upset, SUM(open_sale) AS open_sale,
                SUM(resolved_without_human) AS resolved, SUM(CASE WHEN sentiment = 'positivo' THEN 1 ELSE 0 END) AS positive
         FROM conversation_insights WHERE created_at >= ?`,
      )
      .bind(Date.now() - 30 * DAY)
      .first<Row>();
    const top = async (column: "intent" | "objection") => {
      const { results: rows } = await this.db
        .prepare(
          `SELECT ${column} AS label, COUNT(*) AS n FROM conversation_insights
           WHERE ${column} IS NOT NULL AND ${column} != '' AND created_at >= ? GROUP BY lower(${column}) ORDER BY n DESC LIMIT 5`,
        )
        .bind(Date.now() - 30 * DAY)
        .all<Row>();
      return rows.map((x) => ({ label: String(x.label), count: num(x.n) }));
    };
    const total = num(agg?.n);
    return {
      items,
      summary: {
        analyzed: total,
        averageRating: total ? Math.round(num(agg?.avg) * 10) / 10 : null,
        upset: num(agg?.upset),
        openSales: num(agg?.open_sale),
        resolvedWithoutHumanPct: total ? Math.round((num(agg?.resolved) / total) * 100) : 0,
        positivePct: total ? Math.round((num(agg?.positive) / total) * 100) : 0,
        topIntents: await top("intent"),
        topObjections: await top("objection"),
      },
    };
  }
}
