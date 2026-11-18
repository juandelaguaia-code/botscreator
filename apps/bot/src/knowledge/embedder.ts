import { normalizeQuestion } from "@yunque/core";

/** Convierte textos en vectores para buscar por significado. */
export interface Embedder {
  /** Identificador del modelo; los vectores de modelos distintos no son comparables. */
  readonly id: string;
  /** Relevancia mínima recomendada para confiar en un pasaje con este modelo. */
  readonly recommendedMinScore: number;
  embed(texts: string[]): Promise<number[][]>;
}

const BGE_M3 = "@cf/baai/bge-m3";
const BATCH = 32;

/** Producción: bge-m3 en Workers AI (multilingüe, 1024 dimensiones, bueno en español). */
export class WorkersAiEmbedder implements Embedder {
  readonly id = BGE_M3;
  readonly recommendedMinScore = 0.7;

  constructor(private readonly ai: Ai) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const res = (await this.ai.run(BGE_M3, { text: batch })) as { data?: number[][] };
      if (!res.data || res.data.length !== batch.length) {
        throw new Error("Workers AI no devolvió los embeddings esperados");
      }
      out.push(...res.data);
    }
    return out;
  }
}

const STOPWORDS = new Set(
  (
    "el la los las un una unos unas de del al a en y o u que se su sus por para con sin es son " +
    "lo le les me mi mis tu tus te nos como mas pero si no ya hay muy esta este estos estas ese esa " +
    "the a an of to in and or is are for on with at by it this that be do does you your we our " +
    "o os as um uma de da do das dos em no na nos nas para com por que e ou"
  ).split(" "),
);

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Desarrollo local y tests: vector de palabras (hashing trick) con raíces de 5 letras. Es léxico,
 * no semántico, pero funciona sin cuenta de Cloudflare y con el mismo flujo que producción.
 */
export class HashEmbedder implements Embedder {
  readonly id = "local-hash-v1";
  /** Coseno léxico: dos raíces en común con un trozo mediano ya superan este umbral. */
  readonly recommendedMinScore = 0.15;

  constructor(private readonly dimensions = 512) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vector(t));
  }

  private vector(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const words = normalizeQuestion(text)
      .split(" ")
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
      .map((w) => (w.length > 5 ? w.slice(0, 5) : w));
    for (const w of words) {
      const slot = fnv1a(w) % this.dimensions;
      v[slot] = (v[slot] ?? 0) + 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm === 0 ? v : v.map((x) => x / norm);
  }
}
