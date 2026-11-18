/**
 * Encuestas: reconoce una calificación del 1 al 5 en la respuesta del cliente ("5", "un 4",
 * "⭐⭐⭐", "4/5"). Si el mensaje dice otra cosa, no es una respuesta de encuesta.
 */
export function parseRating(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t.length === 0 || t.length > 40) return null;
  const stars = (t.match(/⭐|★/g) ?? []).length;
  if (stars >= 1 && stars <= 5 && t.replace(/⭐|★|\s/g, "") === "") return stars;
  const match = t.match(
    /^(?:un|una|a|uma|le doy|doy|nota|calificaci[oó]n)?\s*([1-5])(?:\s*(?:\/\s*5|de 5|estrellas?|stars?|⭐))?\s*[.!]*$/,
  );
  return match ? Number(match[1]) : null;
}
