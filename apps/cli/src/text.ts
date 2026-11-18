/** Quita comentarios (`//` y `/* *\/`) y comas finales de un JSONC, respetando el texto entre comillas. */
export function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** "Barbería Don Pepe" → "barberia-don-pepe" (máximo 24 caracteres, apto para nombres de Cloudflare). */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;

/** Nombres de los recursos de Cloudflare de un bot. Nunca se comparten entre bots. */
export function resourceNames(slug: string) {
  return {
    worker: `bot-${slug}`,
    database: `bot-${slug}-db`,
    index: `bot-${slug}-kb`,
    bucket: `bot-${slug}-media`,
  };
}

/** Primer JSON (objeto o arreglo) dentro de una salida de consola que puede traer avisos antes. */
export function extractJson(output: string): unknown {
  for (let start = 0; start < output.length; start++) {
    if (output[start] !== "[" && output[start] !== "{") continue;
    for (let end = output.length; end > start; end--) {
      const ch = output[end - 1];
      if (ch !== "]" && ch !== "}") continue;
      try {
        return JSON.parse(output.slice(start, end));
      } catch {
        // ni este cierre ni este comienzo: seguimos buscando (p. ej. "[WARNING]" antes del JSON)
      }
    }
  }
  return null;
}
