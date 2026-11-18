/**
 * Detección determinista de "quiero hablar con una persona". Si el cliente lo pide de forma
 * explícita no gastamos una llamada a la IA: creamos el ticket y respondemos con el acuse.
 * Los demás disparadores (queja, facturación, legal, vueltas sin resolver) los decide el modelo
 * con la herramienta `pedir_humano`, porque requieren entender el contexto.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const HUMAN_WORDS_ES =
  "(persona|humano|humana|alguien|asesor|asesora|agente|ejecutivo|ejecutiva|encargado|encargada|dueno|duena|operador|operadora)";

const PATTERNS: RegExp[] = [
  // español
  new RegExp(
    `\\b(hablar|comunicarme|conversar|chatear) con (un|una|el|la|algun|alguna)? ?${HUMAN_WORDS_ES}`,
  ),
  new RegExp(
    `\\b(quiero|necesito|pasame|paseme|pasame con|comunicame) (con )?(un|una|el|la)? ?${HUMAN_WORDS_ES}( real)?\\b`,
  ),
  /\b(atencion|atendimiento) humana?\b/,
  /\bpersona (real|de verdad)\b/,
  /\bno (quiero|me sirve) (hablar con )?(un|el) (bot|robot)\b/,
  // english
  /\b(talk|speak|chat) (to|with) (a |an |the )?(human|person|agent|representative|someone|manager|owner)\b/,
  /\b(real|live) (person|human|agent)\b/,
  // português
  /\bfalar com (um|uma|o|a|alguem)? ?(atendente|pessoa|humano|humana|alguem|responsavel)\b/,
  /\batendente (humano|real)\b/,
];

export function isExplicitHumanRequest(text: string): boolean {
  const t = normalize(text);
  if (t.length === 0 || t.length > 400) return false;
  return PATTERNS.some((p) => p.test(t));
}
