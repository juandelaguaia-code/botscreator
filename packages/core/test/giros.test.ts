import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  businessProfileSchema,
  detectLanguage,
  GIRO_IDS,
  GIROS,
  giroOf,
} from "../src/index.js";

describe("giros", () => {
  it("hay 14 giros más el general, todos completos", () => {
    expect(GIRO_IDS).toHaveLength(15);
    for (const id of GIRO_IDS) {
      const g = GIROS[id];
      expect(g.name.length).toBeGreaterThan(2);
      expect(g.playbook.length).toBeGreaterThan(40);
      expect(g.suggestedQuestions.length).toBeGreaterThan(0);
    }
  });

  it("ningún giro trae precios inventados", () => {
    for (const id of GIRO_IDS) {
      const g = GIROS[id];
      expect(`${g.playbook} ${g.suggestedOfferings.join(" ")}`).not.toMatch(/\$\s?\d/);
    }
  });

  it("los giros de salud prohíben diagnosticar", () => {
    expect(GIROS.clinica.playbook).toMatch(/diagn/i);
    expect(GIROS.dentista.playbook).toMatch(/diagn/i);
  });

  it("un giro desconocido cae en general", () => {
    expect(giroOf("nada").id).toBe("general");
  });
});

describe("prompt con giro, ejemplos e instrucciones por canal", () => {
  const profile = businessProfileSchema.parse({
    name: "Clínica Sur",
    giro: "clinica",
    examples: [
      { customer: "¿Atienden hoy?", reply: "Sí, hoy atendemos hasta las 19:00. ¿Te agendo?" },
    ],
    channelInstructions: { whatsapp: "Firma cada mensaje con «Equipo Clínica Sur»." },
  });

  it("agrega la guía del giro como sección bloqueada", () => {
    const built = buildSystemPrompt({ profile, channel: "web", now: new Date() });
    const giro = built.sections.find((s) => s.id === "giro");
    expect(giro?.locked).toBe(true);
    expect(giro?.text).toContain("emergencia");
  });

  it("los ejemplos enseñan estilo y las instrucciones por canal solo van en su canal", () => {
    const web = buildSystemPrompt({ profile, channel: "web", now: new Date() });
    const wa = buildSystemPrompt({ profile, channel: "whatsapp", now: new Date() });
    expect(web.stable).toContain("Cliente: ¿Atienden hoy?");
    expect(web.stable).not.toContain("Equipo Clínica Sur");
    expect(wa.stable).toContain("Equipo Clínica Sur");
  });

  it("el giro general no agrega sección", () => {
    const built = buildSystemPrompt({
      profile: businessProfileSchema.parse({ name: "X" }),
      channel: "web",
      now: new Date(),
    });
    expect(built.sections.some((s) => s.id === "giro")).toBe(false);
  });
});

describe("detectLanguage", () => {
  it.each([
    ["Hola, ¿cuánto cuesta el corte?", "es-419"],
    ["Hi, how much is the haircut please?", "en"],
    ["Oi, quanto custa? Você tem horário?", "pt-BR"],
  ] as const)("%s → %s", (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });

  it("sin señal clara devuelve null", () => {
    expect(detectLanguage("👍")).toBeNull();
    expect(detectLanguage("ok")).toBeNull();
  });
});
