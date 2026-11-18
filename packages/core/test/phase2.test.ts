import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  businessProfileSchema,
  buttonsAsText,
  chunkText,
  cosineSimilarity,
  extractButtons,
  findUnsupportedClaims,
  htmlToText,
  normalizeQuestion,
  toCsv,
} from "../src/index.js";

describe("chunkText", () => {
  it("respeta párrafos, antepone el título y no supera el tamaño", () => {
    const text = Array.from(
      { length: 12 },
      (_, i) => `Párrafo ${i}. ${"palabra ".repeat(30)}`,
    ).join("\n\n");
    const chunks = chunkText(text, "Políticas", { maxChars: 400, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.startsWith("Políticas\n")).toBe(true);
      expect(c.length).toBeLessThanOrEqual(400 + "Políticas\n".length + 60);
    }
  });

  it("parte oraciones y palabras enormes sin perder texto", () => {
    const chunks = chunkText(`${"x".repeat(50)} ${"y".repeat(50)}`, "", {
      maxChars: 60,
      overlap: 0,
    });
    expect(chunks.join(" ")).toContain("x".repeat(50));
    expect(chunks.join(" ")).toContain("y".repeat(50));
  });

  it("devuelve vacío con texto vacío", () => {
    expect(chunkText("   ", "t")).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("quita scripts, estilos y navegación y decodifica entidades", () => {
    const html = `<html><head><title>Tacos &amp; Más</title><style>.a{}</style></head><body>
      <nav>Inicio | Menú</nav><h1>Nuestro menú</h1><p>Taco al pastor: $25</p><script>alert(1)</script>
      <ul><li>Agua de horchata</li><li>Jamaica</li></ul><footer>© 2026</footer></body></html>`;
    const { title, text } = htmlToText(html);
    expect(title).toBe("Tacos & Más");
    expect(text).toContain("Nuestro menú");
    expect(text).toContain("Taco al pastor: $25");
    expect(text).toContain("- Agua de horchata");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("Inicio | Menú");
  });
});

describe("normalizeQuestion y cosineSimilarity", () => {
  it("normaliza acentos, mayúsculas y signos", () => {
    expect(normalizeQuestion("¿Cuánto CUESTA el envío?")).toBe("cuanto cuesta el envio");
  });
  it("calcula coseno", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("findUnsupportedClaims", () => {
  const source =
    "Corte de cabello · $150 · 30 min\nHorario: L-S 9:00-20:00\nEnvío gratis en la zona centro";

  it("acepta cifras presentes en la fuente aunque cambie el formato", () => {
    expect(findUnsupportedClaims("El corte cuesta $150 y abrimos a las 9", source)).toEqual({
      numbers: [],
      promises: [],
    });
    expect(findUnsupportedClaims("Total: 1,800", "Paquete de 6 clases: 1800")).toEqual({
      numbers: [],
      promises: [],
    });
  });

  it("detecta precios y promesas que no están en la fuente", () => {
    const check = findUnsupportedClaims("Te queda en $120 con 15% de descuento y garantía", source);
    expect(check.numbers).toEqual(expect.arrayContaining(["120", "15"]));
    expect(check.promises).toEqual(expect.arrayContaining(["descuent", "garantia"]));
  });

  it("ignora cifras de un dígito que no son datos de negocio", () => {
    expect(findUnsupportedClaims("Tengo 2 opciones para ti", source).numbers).toEqual([]);
  });

  it("acepta la palabra de promesa si la fuente la tiene", () => {
    expect(findUnsupportedClaims("El envío es gratis en el centro", source).promises).toEqual([]);
  });
});

describe("botones", () => {
  it("extrae hasta tres opciones y limpia el marcador", () => {
    const out = extractButtons(
      "¿Te aparto el jueves?\n[[opciones: Sí | No | Otro día | Más tarde]]",
    );
    expect(out.text).toBe("¿Te aparto el jueves?");
    expect(out.buttons).toEqual(["Sí", "No", "Otro día"]);
  });
  it("sin marcador no hay botones", () => {
    expect(extractButtons("hola")).toEqual({ text: "hola", buttons: [] });
  });
  it("arma una lista numerada para canales sin botones", () => {
    expect(buttonsAsText("Elige:", ["A", "B"])).toBe("Elige:\n\n1. A\n2. B");
  });
});

describe("toCsv", () => {
  it("escapa comillas, saltos de línea y fórmulas", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["=SUMA(1)", 'dijo "hola"\nadiós'],
        [null, 3],
      ],
    );
    expect(csv).toBe(`a,b\r\n'=SUMA(1),"dijo ""hola""\nadiós"\r\n,3`);
  });
});

describe("buildSystemPrompt (fase 2)", () => {
  const profile = businessProfileSchema.parse({ name: "Spa Luna" });

  it("agrega pasajes al bloque volátil y menciona la búsqueda en los frenos", () => {
    const built = buildSystemPrompt({
      profile,
      channel: "web",
      now: new Date(),
      knowledgeBase: true,
      passages: [{ title: "Políticas", text: "Cancelaciones con 24 h de aviso.", score: 0.83 }],
    });
    expect(built.stable).toContain("buscar_conocimiento");
    expect(built.volatile).toContain("Cancelaciones con 24 h de aviso.");
    expect(built.volatile).toContain("relevancia 0.83");
  });

  it("avisa cuando no hay pasajes relevantes y agrega los botones si están activos", () => {
    const built = buildSystemPrompt({
      profile,
      channel: "web",
      now: new Date(),
      knowledgeBase: true,
      buttons: true,
    });
    expect(built.volatile).toContain("Ninguno con relevancia suficiente");
    expect(built.stable).toContain("[[opciones:");
  });

  it("sin base de conocimiento no menciona la herramienta de búsqueda", () => {
    const built = buildSystemPrompt({ profile, channel: "web", now: new Date() });
    expect(built.stable).not.toContain("buscar_conocimiento");
    expect(built.volatile).not.toContain("Pasajes");
  });
});
