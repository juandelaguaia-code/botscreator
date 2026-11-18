/**
 * Blindaje anti-invento · detección barata de afirmaciones sin respaldo.
 *
 * Antes de gastar una llamada de verificación, comparamos los datos "duros" de la respuesta
 * (precios, horas, porcentajes, cifras) y las palabras de promesa (descuento, gratis, garantía…)
 * contra la fuente de verdad. Solo si algo no aparece en la fuente se pide verificación al modelo.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Números con al menos dos dígitos, horas (9:30) y montos con separadores (1.800 / 1,800). */
const NUMBER_TOKEN = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+:\d{2}|\d+(?:[.,]\d+)?/g;

function numericKeys(token: string): string[] {
  const keys = new Set<string>();
  const time = token.match(/^(\d{1,2}):(\d{2})$/);
  if (time) {
    keys.add(`${Number(time[1])}${time[2]}`);
    if (time[2] === "00") keys.add(String(Number(time[1])));
    return [...keys];
  }
  // "1.800" / "1,800" / "1800" → "1800"; "12,50" → "1250" y "12.50"
  const digits = token.replace(/[.,]/g, "");
  keys.add(digits.replace(/^0+(?=\d)/, ""));
  return [...keys];
}

function extractNumbers(text: string): Array<{ token: string; keys: string[] }> {
  const out: Array<{ token: string; keys: string[] }> = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = match[0];
    const keys = numericKeys(token);
    // cifras de un solo dígito ("2 opciones", "1 persona") no son afirmaciones de negocio
    if (!token.includes(":") && keys.every((k) => k.length < 2)) continue;
    out.push({ token, keys });
  }
  return out;
}

/** Raíces de palabras que suelen implicar una promesa o una política. */
const PROMISE_STEMS = [
  "descuent",
  "gratis",
  "gratuit",
  "sin costo",
  "sin cargo",
  "garantia",
  "reembols",
  "devolucion",
  "promocion",
  "promo ",
  "oferta",
  "2x1",
  "meses sin intereses",
  "regalo",
  "cortesia",
  "bonificacion",
  "discount",
  "free of charge",
  "for free",
  "guarantee",
  "warranty",
  "refund",
  "desconto",
  "garantia",
  "promocao",
  "brinde",
];

export interface ClaimCheck {
  /** Cifras de la respuesta que no aparecen en la fuente. */
  numbers: string[];
  /** Palabras de promesa de la respuesta que no aparecen en la fuente. */
  promises: string[];
}

export function findUnsupportedClaims(reply: string, source: string): ClaimCheck {
  const sourceKeys = new Set(extractNumbers(source).flatMap((n) => n.keys));
  const numbers = extractNumbers(reply)
    .filter((n) => !n.keys.some((k) => sourceKeys.has(k)))
    .map((n) => n.token);

  const r = ` ${normalize(reply)} `;
  const s = ` ${normalize(source)} `;
  const promises = PROMISE_STEMS.filter((stem) => r.includes(stem) && !s.includes(stem)).map(
    (stem) => stem.trim(),
  );

  return { numbers: [...new Set(numbers)], promises: [...new Set(promises)] };
}

export function hasUnsupportedClaims(check: ClaimCheck): boolean {
  return check.numbers.length > 0 || check.promises.length > 0;
}
