import { z } from "zod";
import { GIRO_IDS } from "./giros.js";

/** Idiomas de sistema soportados. `espejo` contesta en el idioma de cada cliente. */
export const LANGUAGES = ["es-419", "es-ES", "en", "pt-BR", "espejo"] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

/** Presets de voz de marca. Cambian CÓMO suena el bot, nunca sus frenos. */
export const TONES = ["cercano", "formal", "divertido"] as const;
export const toneSchema = z.enum(TONES);
export type Tone = z.infer<typeof toneSchema>;

export const offeringSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).optional(),
  /** Duración en minutos, para servicios que se agendan. */
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  bookable: z.boolean().optional(),
});
export type Offering = z.infer<typeof offeringSchema>;

export const faqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(1500),
});
export type Faq = z.infer<typeof faqSchema>;

/**
 * El "cerebro estructurado" del negocio: cada dato vive en su campo y el bot lo usa como
 * fuente de verdad. Lo edita el dueño desde el panel; aplica al siguiente mensaje.
 */
export const businessProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** A qué se dedica, en una o dos frases. */
  description: z.string().trim().max(1000).default(""),
  offerings: z.array(offeringSchema).max(200).default([]),
  /** Horario en texto libre ("L-V 9:00-19:00, S 10:00-14:00"). */
  hours: z.string().trim().max(500).default(""),
  /** Zona horaria IANA, p. ej. "America/Santiago". */
  timezone: z.string().trim().max(64).default("America/Mexico_City"),
  location: z.string().trim().max(500).default(""),
  phone: z.string().trim().max(60).default(""),
  website: z.string().trim().max(300).default(""),
  paymentMethods: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  faq: z.array(faqSchema).max(100).default([]),
  /** Promoción vigente que el bot menciona cuando viene al caso. */
  promotion: z.string().trim().max(1000).default(""),
  /** Instrucciones del dueño: reglas de comportamiento, qué no hacer, cuándo pasar a humano. */
  instructions: z.string().trim().max(16_000).default(""),
  tone: toneSchema.default("cercano"),
  language: languageSchema.default("es-419"),
  /** Símbolo de moneda para precios. */
  currency: z.string().trim().min(1).max(5).default("$"),
  /** Giro del negocio: aporta la guía de atención del rubro. */
  giro: z.enum(GIRO_IDS).default("general"),
  /** Instrucciones extra por canal (p. ej. más formal en WhatsApp, más casual en Instagram). */
  channelInstructions: z
    .object({
      web: z.string().trim().max(2000).optional(),
      whatsapp: z.string().trim().max(2000).optional(),
      telegram: z.string().trim().max(2000).optional(),
      instagram: z.string().trim().max(2000).optional(),
      messenger: z.string().trim().max(2000).optional(),
    })
    .default({}),
  /** Ejemplos de respuestas ideales (few-shot): enseñan estilo, nunca datos. */
  examples: z
    .array(
      z.object({
        customer: z.string().trim().min(1).max(500),
        reply: z.string().trim().min(1).max(1000),
      }),
    )
    .max(10)
    .default([]),
  /** Link para dejar reseña (Google u otro). Activa el superpoder Pide reseñas. */
  reviewUrl: z.string().trim().url().max(500).or(z.literal("")).default(""),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export function defaultBusinessProfile(name = "Mi negocio"): BusinessProfile {
  return businessProfileSchema.parse({ name });
}
