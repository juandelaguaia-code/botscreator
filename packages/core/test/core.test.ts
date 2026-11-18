import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  businessProfileSchema,
  chooseModelTier,
  isExplicitHumanRequest,
  systemMessage,
  TOOL_NAMES,
} from "../src/index.js";

const profile = businessProfileSchema.parse({
  name: "Tacos Ana",
  description: "Taquería familiar",
  offerings: [
    { name: "Taco al pastor", price: "25" },
    { name: "Corte de cabello", price: "150", durationMinutes: 30, bookable: true },
  ],
  hours: "L-S 9:00-20:00",
  timezone: "America/Santiago",
  paymentMethods: ["efectivo", "tarjeta"],
  faq: [{ question: "¿Hacen envíos?", answer: "Sí, en la zona centro." }],
  instructions: "No prometer tiempos de entrega.",
  tone: "formal",
  language: "en",
});

describe("buildSystemPrompt", () => {
  const built = buildSystemPrompt({
    profile,
    channel: "whatsapp",
    now: new Date("2026-11-17T15:00:00Z"),
  });

  it("pone los frenos primero y bloqueados", () => {
    expect(built.sections[0]?.id).toBe("guardrails");
    expect(built.sections[0]?.locked).toBe(true);
    expect(built.stable.indexOf("Reglas que nunca se rompen")).toBeLessThan(
      built.stable.indexOf("Instrucciones del dueño"),
    );
  });

  it("incluye los datos estructurados del negocio con moneda y duración", () => {
    expect(built.stable).toContain("Taco al pastor · $25");
    expect(built.stable).toContain("Corte de cabello · $150 · 30 min · se puede agendar");
    expect(built.stable).toContain("Métodos de pago: efectivo, tarjeta");
    expect(built.stable).toContain("P: ¿Hacen envíos?");
  });

  it("menciona las herramientas por su nombre", () => {
    expect(built.stable).toContain(TOOL_NAMES.requestHuman);
    expect(built.stable).toContain(TOOL_NAMES.captureLead);
  });

  it("aplica voz, canal e idioma", () => {
    expect(built.stable).toContain("hablas de usted");
    expect(built.stable).toContain("WhatsApp");
    expect(built.stable).toContain("English");
  });

  it("deja la fecha fuera del bloque estable para no romper la caché", () => {
    expect(built.stable).not.toContain("Fecha y hora");
    expect(built.volatile).toContain("Fecha y hora actual");
  });

  it("omite la sección de instrucciones si el dueño no escribió nada", () => {
    const sinInstrucciones = buildSystemPrompt({
      profile: { ...profile, instructions: "" },
      channel: "web",
      now: new Date(),
    });
    expect(sinInstrucciones.sections.some((s) => s.id === "instructions")).toBe(false);
  });
});

describe("isExplicitHumanRequest", () => {
  it.each([
    "Quiero hablar con una persona",
    "necesito un asesor",
    "pásame con un humano real",
    "¿Puedo hablar con el encargado?",
    "I want to talk to a human",
    "real person please",
    "quero falar com um atendente",
  ])("detecta: %s", (text) => {
    expect(isExplicitHumanRequest(text)).toBe(true);
  });

  it.each([
    "¿A qué hora abren?",
    "Quiero dos tacos",
    "¿Tienen servicio para personas mayores?",
    "",
  ])("no se dispara con: %s", (text) => {
    expect(isExplicitHumanRequest(text)).toBe(false);
  });
});

describe("chooseModelTier", () => {
  const base = { text: "hola", multiStepFlow: false, hasImage: false, customerTurns: 1 };

  it("respeta los modos fijos", () => {
    expect(chooseModelTier("economico", { ...base, multiStepFlow: true })).toBe("fast");
    expect(chooseModelTier("maximo", base)).toBe("max");
  });

  it("en equilibrado usa el rápido para lo simple y sube en lo difícil", () => {
    expect(chooseModelTier("equilibrado", base)).toBe("fast");
    expect(chooseModelTier("equilibrado", { ...base, multiStepFlow: true })).toBe("smart");
    expect(chooseModelTier("equilibrado", { ...base, text: "quiero un reembolso" })).toBe("smart");
    expect(chooseModelTier("equilibrado", { ...base, hasImage: true })).toBe("smart");
  });
});

describe("systemMessage", () => {
  it("usa español latino de base en modo espejo", () => {
    expect(systemMessage("espejo", "handoffAck")).toBe(systemMessage("es-419", "handoffAck"));
    expect(systemMessage("en", "handoffAck")).toMatch(/team/);
  });
});
