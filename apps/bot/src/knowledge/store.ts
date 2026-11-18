import type { GapSource } from "@yunque/core";
import { newId } from "../lib/crypto.js";

type Row = Record<string, unknown>;

export interface KbDocumentRecord {
  id: string;
  title: string;
  source: "manual" | "url";
  sourceUrl: string | null;
  content: string;
  status: "ready" | "error";
  error: string | null;
  chunkCount: number;
  embeddingModel: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface KbChunkRecord {
  id: string;
  documentId: string;
  title: string;
  content: string;
}

export interface GapRecord {
  id: string;
  question: string;
  normalized: string;
  embedding: number[] | null;
  embeddingModel: string | null;
  source: GapSource;
  conversationId: string | null;
  hits: number;
  status: "open" | "resolved" | "ignored";
  resolution: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function toDocument(r: Row): KbDocumentRecord {
  return {
    id: String(r.id),
    title: String(r.title),
    source: r.source === "url" ? "url" : "manual",
    sourceUrl: str(r.source_url),
    content: String(r.content ?? ""),
    status: r.status === "error" ? "error" : "ready",
    error: str(r.error),
    chunkCount: Number(r.chunk_count ?? 0),
    embeddingModel: str(r.embedding_model),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function toGap(r: Row): GapRecord {
  let embedding: number[] | null = null;
  if (typeof r.embedding === "string") {
    try {
      embedding = JSON.parse(r.embedding) as number[];
    } catch {
      embedding = null;
    }
  }
  return {
    id: String(r.id),
    question: String(r.question),
    normalized: String(r.normalized),
    embedding,
    embeddingModel: str(r.embedding_model),
    source: String(r.source) as GapSource,
    conversationId: str(r.conversation_id),
    hits: Number(r.hits ?? 1),
    status: r.status === "resolved" ? "resolved" : r.status === "ignored" ? "ignored" : "open",
    resolution: str(r.resolution),
    firstSeenAt: Number(r.first_seen_at),
    lastSeenAt: Number(r.last_seen_at),
  };
}

/** Persistencia de la base de conocimiento y del radar de huecos (D1). */
export class KnowledgeStore {
  constructor(
    private readonly db: D1Database,
    private readonly clock: () => number = Date.now,
  ) {}

  // ---------- documentos ----------

  async createDocument(input: {
    title: string;
    content: string;
    source: "manual" | "url";
    sourceUrl?: string | null;
  }): Promise<KbDocumentRecord> {
    const now = this.clock();
    const row = await this.db
      .prepare(
        `INSERT INTO kb_documents (id, title, source, source_url, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        newId("kd"),
        input.title,
        input.source,
        input.sourceUrl ?? null,
        input.content,
        now,
        now,
      )
      .first<Row>();
    if (!row) throw new Error("No se pudo guardar el documento");
    return toDocument(row);
  }

  async updateDocumentContent(id: string, title: string, content: string): Promise<void> {
    await this.db
      .prepare("UPDATE kb_documents SET title = ?, content = ?, updated_at = ? WHERE id = ?")
      .bind(title, content, this.clock(), id)
      .run();
  }

  async markIndexed(
    id: string,
    result: {
      status: "ready" | "error";
      chunkCount: number;
      embeddingModel: string | null;
      error?: string;
    },
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE kb_documents SET status = ?, chunk_count = ?, embedding_model = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        result.status,
        result.chunkCount,
        result.embeddingModel,
        result.error ?? null,
        this.clock(),
        id,
      )
      .run();
  }

  async getDocument(id: string): Promise<KbDocumentRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM kb_documents WHERE id = ?")
      .bind(id)
      .first<Row>();
    return row ? toDocument(row) : null;
  }

  async listDocuments(): Promise<KbDocumentRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM kb_documents ORDER BY updated_at DESC LIMIT 500")
      .all<Row>();
    return results.map(toDocument);
  }

  async countIndexedDocuments(embeddingModel: string): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM kb_documents WHERE status = 'ready' AND chunk_count > 0 AND embedding_model = ?",
      )
      .bind(embeddingModel)
      .first<Row>();
    return Number(row?.n ?? 0);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM kb_documents WHERE id = ?").bind(id).run();
  }

  // ---------- trozos ----------

  async listChunkIds(documentId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT id FROM kb_chunks WHERE document_id = ?")
      .bind(documentId)
      .all<Row>();
    return results.map((r) => String(r.id));
  }

  /** Reemplaza los trozos de un documento (los vectores los escribe el índice). */
  async replaceChunks(
    documentId: string,
    chunks: Array<{ id: string; content: string }>,
    embeddingModel: string,
  ): Promise<void> {
    const now = this.clock();
    await this.db.batch([
      this.db.prepare("DELETE FROM kb_chunks WHERE document_id = ?").bind(documentId),
      ...chunks.map((c, ord) =>
        this.db
          .prepare(
            "INSERT INTO kb_chunks (id, document_id, ord, content, embedding_model, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(c.id, documentId, ord, c.content, embeddingModel, now),
      ),
    ]);
  }

  async getChunks(ids: string[], embeddingModel: string): Promise<KbChunkRecord[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await this.db
      .prepare(
        `SELECT c.id, c.document_id, c.content, d.title FROM kb_chunks c
         JOIN kb_documents d ON d.id = c.document_id
         WHERE c.id IN (${placeholders}) AND c.embedding_model = ?`,
      )
      .bind(...ids, embeddingModel)
      .all<Row>();
    return results.map((r) => ({
      id: String(r.id),
      documentId: String(r.document_id),
      title: String(r.title),
      content: String(r.content),
    }));
  }

  // ---------- radar de huecos ----------

  async listOpenGaps(limit: number): Promise<GapRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM knowledge_gaps WHERE status = 'open' ORDER BY last_seen_at DESC LIMIT ?",
      )
      .bind(limit)
      .all<Row>();
    return results.map(toGap);
  }

  async insertGap(input: {
    question: string;
    normalized: string;
    embedding: number[] | null;
    embeddingModel: string | null;
    source: GapSource;
    conversationId: string | null;
  }): Promise<GapRecord> {
    const now = this.clock();
    const row = await this.db
      .prepare(
        `INSERT INTO knowledge_gaps (id, question, normalized, embedding, embedding_model, source, conversation_id,
           first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        newId("gap"),
        input.question,
        input.normalized,
        input.embedding ? JSON.stringify(input.embedding) : null,
        input.embeddingModel,
        input.source,
        input.conversationId,
        now,
        now,
      )
      .first<Row>();
    if (!row) throw new Error("No se pudo registrar el hueco");
    return toGap(row);
  }

  async bumpGap(id: string, conversationId: string | null): Promise<void> {
    await this.db
      .prepare(
        "UPDATE knowledge_gaps SET hits = hits + 1, last_seen_at = ?, conversation_id = COALESCE(?, conversation_id) WHERE id = ?",
      )
      .bind(this.clock(), conversationId, id)
      .run();
  }

  async listGaps(status: "open" | "resolved" | "ignored", since: number): Promise<GapRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM knowledge_gaps WHERE status = ? AND last_seen_at >= ?
         ORDER BY hits DESC, last_seen_at DESC LIMIT 300`,
      )
      .bind(status, since)
      .all<Row>();
    return results.map(toGap);
  }

  async getGap(id: string): Promise<GapRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM knowledge_gaps WHERE id = ?")
      .bind(id)
      .first<Row>();
    return row ? toGap(row) : null;
  }

  async closeGap(
    id: string,
    status: "resolved" | "ignored",
    resolution: string | null,
  ): Promise<boolean> {
    const res = await this.db
      .prepare(
        "UPDATE knowledge_gaps SET status = ?, resolution = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
      )
      .bind(status, resolution, this.clock(), id)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
}
