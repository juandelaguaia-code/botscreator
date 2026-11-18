import { cosineSimilarity } from "@yunque/core";

export interface VectorMatch {
  id: string;
  score: number;
}

export interface VectorItem {
  id: string;
  values: number[];
  documentId: string;
}

/** Índice de vectores de la base de conocimiento. */
export interface VectorIndex {
  readonly kind: "vectorize" | "d1";
  upsert(items: VectorItem[]): Promise<void>;
  query(values: number[], topK: number): Promise<VectorMatch[]>;
  deleteByIds(ids: string[]): Promise<void>;
}

const MUTATION_BATCH = 500;

/** Producción: Cloudflare Vectorize (métrica coseno). Las escrituras tardan unos segundos en verse. */
export class VectorizeIndex implements VectorIndex {
  readonly kind = "vectorize" as const;

  constructor(private readonly index: Vectorize) {}

  async upsert(items: VectorItem[]): Promise<void> {
    for (let i = 0; i < items.length; i += MUTATION_BATCH) {
      await this.index.upsert(
        items
          .slice(i, i + MUTATION_BATCH)
          .map((it) => ({ id: it.id, values: it.values, metadata: { documentId: it.documentId } })),
      );
    }
  }

  async query(values: number[], topK: number): Promise<VectorMatch[]> {
    const res = await this.index.query(values, { topK, returnMetadata: "none" });
    return res.matches.map((m) => ({ id: m.id, score: m.score }));
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += MUTATION_BATCH) {
      await this.index.deleteByIds(ids.slice(i, i + MUTATION_BATCH));
    }
  }
}

/** Tope del índice local: pensado para desarrollo y bases chicas. */
const LOCAL_SCAN_LIMIT = 5000;

/**
 * Desarrollo local: guarda el vector en `kb_chunks.embedding` y compara por fuerza bruta.
 * Las filas las crea y borra el almacén de conocimiento; aquí solo se escribe el vector.
 */
export class D1VectorIndex implements VectorIndex {
  readonly kind = "d1" as const;

  constructor(
    private readonly db: D1Database,
    private readonly modelId: string,
  ) {}

  async upsert(items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.db.batch(
      items.map((it) =>
        this.db
          .prepare("UPDATE kb_chunks SET embedding = ? WHERE id = ?")
          .bind(JSON.stringify(it.values.map((x) => Math.round(x * 1e6) / 1e6)), it.id),
      ),
    );
  }

  async query(values: number[], topK: number): Promise<VectorMatch[]> {
    const { results } = await this.db
      .prepare(
        "SELECT id, embedding FROM kb_chunks WHERE embedding_model = ? AND embedding IS NOT NULL LIMIT ?",
      )
      .bind(this.modelId, LOCAL_SCAN_LIMIT)
      .all<{ id: string; embedding: string }>();
    return results
      .map((r) => ({
        id: r.id,
        score: cosineSimilarity(values, JSON.parse(r.embedding) as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async deleteByIds(): Promise<void> {
    // las filas (y su vector) se borran junto con el trozo en kb_chunks
  }
}
