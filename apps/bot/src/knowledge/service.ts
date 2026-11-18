import {
  chunkText,
  cosineSimilarity,
  type GapSource,
  type KnowledgeEngineDto,
  normalizeQuestion,
} from "@yunque/core";
import { newId } from "../lib/crypto.js";
import type { Embedder } from "./embedder.js";
import type { GapRecord, KbDocumentRecord, KnowledgeStore } from "./store.js";
import type { VectorIndex } from "./vector-index.js";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  title: string;
  text: string;
  score: number;
  passes: boolean;
}

export interface SearchOptions {
  topK: number;
  /** `null` = el umbral recomendado del motor de embeddings. */
  minScore: number | null;
}

export interface SearchResult {
  minScore: number;
  /** Todo lo recuperado, con su relevancia (para el probador del panel). */
  hits: SearchHit[];
  /** Solo lo que pasa el umbral: lo único que el bot puede usar. */
  passing: SearchHit[];
}

/** Lo que el motor de conversación necesita de la base de conocimiento. */
export interface KnowledgeBase {
  readonly recommendedMinScore: number;
  hasDocuments(): Promise<boolean>;
  search(query: string, options: SearchOptions): Promise<SearchResult>;
  recordGap(input: {
    question: string;
    source: GapSource;
    conversationId: string | null;
  }): Promise<void>;
}

const MAX_CHUNKS_PER_DOCUMENT = 400;

export class KnowledgeService implements KnowledgeBase {
  constructor(
    private readonly store: KnowledgeStore,
    private readonly embedder: Embedder,
    private readonly index: VectorIndex,
  ) {}

  get recommendedMinScore(): number {
    return this.embedder.recommendedMinScore;
  }

  get embedderId(): string {
    return this.embedder.id;
  }

  engineInfo(): KnowledgeEngineDto {
    return {
      embedder: this.embedder.id,
      index: this.index.kind,
      recommendedMinScore: this.embedder.recommendedMinScore,
    };
  }

  async hasDocuments(): Promise<boolean> {
    return (await this.store.countIndexedDocuments(this.embedder.id)) > 0;
  }

  // ---------- documentos ----------

  async addDocument(input: {
    title: string;
    content: string;
    source: "manual" | "url";
    sourceUrl?: string | null;
  }): Promise<KbDocumentRecord> {
    const doc = await this.store.createDocument(input);
    await this.indexDocument(doc);
    return (await this.store.getDocument(doc.id)) ?? doc;
  }

  async updateDocument(
    id: string,
    title: string,
    content: string,
  ): Promise<KbDocumentRecord | null> {
    const doc = await this.store.getDocument(id);
    if (!doc) return null;
    await this.store.updateDocumentContent(id, title, content);
    await this.indexDocument({ ...doc, title, content });
    return this.store.getDocument(id);
  }

  async removeDocument(id: string): Promise<boolean> {
    const doc = await this.store.getDocument(id);
    if (!doc) return false;
    await this.index.deleteByIds(await this.store.listChunkIds(id));
    await this.store.deleteDocument(id);
    return true;
  }

  /** Vuelve a indexar todo (p. ej. al pasar del índice local a Vectorize). */
  async reindexAll(): Promise<{ documents: number; errors: number }> {
    const docs = await this.store.listDocuments();
    let errors = 0;
    for (const doc of docs) {
      if (!(await this.indexDocument(doc))) errors++;
    }
    return { documents: docs.length, errors };
  }

  /** Trocea, calcula embeddings y reemplaza los vectores del documento. */
  private async indexDocument(doc: KbDocumentRecord): Promise<boolean> {
    try {
      const pieces = chunkText(doc.content, doc.title);
      if (pieces.length > MAX_CHUNKS_PER_DOCUMENT) {
        throw new Error(
          `El documento es demasiado largo (${pieces.length} trozos; máximo ${MAX_CHUNKS_PER_DOCUMENT}). Divídelo.`,
        );
      }
      const vectors = await this.embedder.embed(pieces);
      const chunks = pieces.map((content) => ({ id: newId("kc"), content }));

      const previous = await this.store.listChunkIds(doc.id);
      if (previous.length > 0) await this.index.deleteByIds(previous);
      await this.store.replaceChunks(doc.id, chunks, this.embedder.id);
      await this.index.upsert(
        chunks.map((c, i) => ({ id: c.id, values: vectors[i] ?? [], documentId: doc.id })),
      );
      await this.store.markIndexed(doc.id, {
        status: "ready",
        chunkCount: chunks.length,
        embeddingModel: this.embedder.id,
      });
      return true;
    } catch (error) {
      await this.store.markIndexed(doc.id, {
        status: "error",
        chunkCount: 0,
        embeddingModel: null,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ---------- búsqueda ----------

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const minScore = options.minScore ?? this.embedder.recommendedMinScore;
    const [vector] = await this.embedder.embed([query]);
    if (!vector) return { minScore, hits: [], passing: [] };
    const matches = await this.index.query(vector, options.topK);
    const chunks = await this.store.getChunks(
      matches.map((m) => m.id),
      this.embedder.id,
    );
    const byId = new Map(chunks.map((c) => [c.id, c]));
    const hits: SearchHit[] = [];
    for (const m of matches) {
      const chunk = byId.get(m.id);
      if (!chunk) continue; // vector huérfano (p. ej. de un documento recién borrado)
      hits.push({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: chunk.title,
        text: chunk.content,
        score: m.score,
        passes: m.score >= minScore,
      });
    }
    return { minScore, hits, passing: hits.filter((h) => h.passes) };
  }

  // ---------- radar de huecos ----------

  /**
   * Registra una pregunta que el bot no pudo responder con respaldo. Si ya hay una duda abierta
   * igual o muy parecida, suma una aparición en vez de duplicarla.
   */
  async recordGap(input: {
    question: string;
    source: GapSource;
    conversationId: string | null;
  }): Promise<void> {
    const question = input.question.trim().slice(0, 500);
    const normalized = normalizeQuestion(question);
    if (normalized.length < 3) return;

    const open = await this.store.listOpenGaps(200);
    const exact = open.find((g) => g.normalized === normalized);
    if (exact) return this.store.bumpGap(exact.id, input.conversationId);

    let embedding: number[] | null = null;
    try {
      [embedding = null] = await this.embedder.embed([question]);
    } catch {
      embedding = null;
    }

    if (embedding) {
      const groupThreshold = Math.min(0.95, this.embedder.recommendedMinScore + 0.2);
      const similar = bestMatch(open, embedding, this.embedder.id);
      if (similar && similar.score >= groupThreshold) {
        return this.store.bumpGap(similar.gap.id, input.conversationId);
      }
    }

    await this.store.insertGap({
      question,
      normalized,
      embedding,
      embeddingModel: embedding ? this.embedder.id : null,
      source: input.source,
      conversationId: input.conversationId,
    });
  }

  listGaps(
    status: "open" | "resolved" | "ignored",
    sinceDays: number,
    now = Date.now(),
  ): Promise<GapRecord[]> {
    return this.store.listGaps(status, now - sinceDays * 86_400_000);
  }

  getGap(id: string): Promise<GapRecord | null> {
    return this.store.getGap(id);
  }

  closeGap(
    id: string,
    status: "resolved" | "ignored",
    resolution: string | null,
  ): Promise<boolean> {
    return this.store.closeGap(id, status, resolution);
  }

  listDocuments(): Promise<KbDocumentRecord[]> {
    return this.store.listDocuments();
  }

  getDocument(id: string): Promise<KbDocumentRecord | null> {
    return this.store.getDocument(id);
  }
}

function bestMatch(
  gaps: GapRecord[],
  embedding: number[],
  model: string,
): { gap: GapRecord; score: number } | null {
  let best: { gap: GapRecord; score: number } | null = null;
  for (const gap of gaps) {
    if (!gap.embedding || gap.embeddingModel !== model) continue;
    const score = cosineSimilarity(gap.embedding, embedding);
    if (!best || score > best.score) best = { gap, score };
  }
  return best;
}
