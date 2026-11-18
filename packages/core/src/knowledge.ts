/** Utilidades puras de la base de conocimiento: troceo, limpieza de HTML y similitud. */

export interface ChunkOptions {
  /** Tamaño objetivo de cada trozo, en caracteres. */
  maxChars?: number;
  /** Caracteres que se repiten entre trozos seguidos para no cortar ideas a la mitad. */
  overlap?: number;
}

function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  // corta por oraciones; si una oración sola es enorme, por palabras
  const sentences = paragraph.match(/[^.!?\n]+[.!?]*\s*/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) out.push(current.trim());
      current = "";
      let piece = "";
      for (const word of sentence.split(/\s+/)) {
        if ((piece + word).length > maxChars && piece) {
          out.push(piece.trim());
          piece = "";
        }
        piece += `${word} `;
      }
      if (piece.trim()) out.push(piece.trim());
      continue;
    }
    if ((current + sentence).length > maxChars && current) {
      out.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Divide un documento en trozos de tamaño parecido respetando párrafos. Cada trozo lleva el título
 * del documento como contexto, para que tenga sentido por sí solo al recuperarlo.
 */
export function chunkText(text: string, title = "", options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 900;
  const overlap = Math.min(options.overlap ?? 120, Math.floor(maxChars / 3));
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!clean) return [];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, maxChars));

  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && `${current}\n\n${p}`.length > maxChars) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      const cut = tail.indexOf(" ");
      current = overlap > 0 ? `${cut >= 0 ? tail.slice(cut + 1) : tail}\n\n${p}` : p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);

  const prefix = title.trim() ? `${title.trim()}\n` : "";
  return chunks.map((c) => `${prefix}${c}`.trim());
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
  uuml: "ü",
  iexcl: "¡",
  iquest: "¿",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? match;
  });
}

/** Extrae el texto legible de una página HTML (para importar la web del negocio). */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1] ?? "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|ul|ol|table|header|main)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

/** Normaliza una pregunta para agrupar dudas repetidas (minúsculas, sin acentos ni signos). */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
