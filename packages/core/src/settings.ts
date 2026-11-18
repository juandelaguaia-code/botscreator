import { z } from "zod";

export const PROVIDERS = ["anthropic", "openai", "xai", "gemini", "fake"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type ProviderId = z.infer<typeof providerSchema>;

/**
 * Nivel de cerebro:
 * - `economico`: siempre el modelo rápido.
 * - `equilibrado`: rápido para lo simple; sube al inteligente en lo difícil.
 * - `maximo`: siempre el modelo más capaz.
 */
export const MODEL_MODES = ["economico", "equilibrado", "maximo"] as const;
export const modelModeSchema = z.enum(MODEL_MODES);
export type ModelMode = z.infer<typeof modelModeSchema>;

export const MODEL_TIERS = ["fast", "smart", "max"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export const botSettingsSchema = z.object({
  /** Interruptor general: con el bot apagado nadie recibe respuesta automática. */
  enabled: z.boolean().default(true),
  provider: providerSchema.default("anthropic"),
  modelMode: modelModeSchema.default("equilibrado"),
  /** IDs de modelo por nivel; vacío = el default del proveedor. */
  models: z
    .object({
      fast: z.string().trim().max(100).optional(),
      smart: z.string().trim().max(100).optional(),
      max: z.string().trim().max(100).optional(),
    })
    .default({}),
  /** Minutos que el bot se aparta cuando un humano responde desde el panel. */
  takeoverMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
  /** Mensajes del historial que se mandan al modelo. */
  historyLimit: z.number().int().min(4).max(100).default(30),
  /** Máximo de mensajes de un cliente en 10 minutos antes de ignorarlo (anti-abuso). */
  rateLimitPer10Min: z.number().int().min(5).max(500).default(30),
  /** Orígenes permitidos para el widget web; vacío = cualquiera. */
  widgetAllowedOrigins: z.array(z.string().trim().max(200)).max(20).default([]),
  /** Botones tocables en elecciones cerradas (opt-in). */
  buttonsEnabled: z.boolean().default(false),
  /** Blindaje: verifica precios, horarios y promesas contra la fuente antes de enviar. */
  verifierEnabled: z.boolean().default(true),
  /** Pasajes de la base de conocimiento que se consultan por turno. */
  kbTopK: z.number().int().min(1).max(10).default(5),
  /**
   * Relevancia mínima para confiar en un pasaje (0–1). `null` = la recomendada por el motor de
   * embeddings (0.7 en producción).
   */
  kbMinScore: z.number().min(0.1).max(0.99).nullable().default(null),
  /** Tope de gasto de IA por mes (USD). Al llegar, el bot deja de usar IA y pasa todo al equipo. */
  monthlyBudgetUsd: z.number().min(0.5).max(100_000).nullable().default(null),
  /** Superpoderes automáticos (corren con el cron cada 15 minutos). */
  automation: z
    .object({
      /** Vigilante: analiza cada conversación cerrada y avisa si hay un cliente molesto o una venta en riesgo. */
      vigilante: z.boolean().default(true),
      /** Cazador: un solo seguimiento a chats enfriados (3–20 h). */
      hunter: z.boolean().default(true),
      hunterDailyMax: z.number().int().min(1).max(200).default(30),
      /** Encuesta 1–5 al cerrar una atención resuelta. */
      surveys: z.boolean().default(false),
      /** Segundo toque a interesados enfriados hace días. */
      noShows: z.boolean().default(false),
      noShowAfterDays: z.number().int().min(1).max(30).default(2),
      /** Invitación a reseña (requiere el link de reseñas del negocio). */
      reviews: z.boolean().default(true),
      /** Resumen nocturno al dueño. */
      dailyReport: z.boolean().default(true),
      dailyReportHour: z.number().int().min(0).max(23).default(21),
      /** Recordatorio ~24 h antes de cada cita agendada por el bot. */
      reminders: z.boolean().default(true),
    })
    .default({
      vigilante: true,
      hunter: true,
      hunterDailyMax: 30,
      surveys: false,
      noShows: false,
      noShowAfterDays: 2,
      reviews: true,
      dailyReport: true,
      dailyReportHour: 21,
      reminders: true,
    }),
  /** Plantillas aprobadas de WhatsApp para escribir fuera de la ventana de 24 h. */
  whatsappTemplates: z
    .object({
      noShow: z
        .object({
          name: z.string().trim().min(1).max(120),
          language: z.string().trim().min(2).max(10),
        })
        .optional(),
      reminder: z
        .object({
          name: z.string().trim().min(1).max(120),
          language: z.string().trim().min(2).max(10),
        })
        .optional(),
      campaign: z
        .object({
          name: z.string().trim().min(1).max(120),
          language: z.string().trim().min(2).max(10),
        })
        .optional(),
    })
    .default({}),
  /** Agenda: el bot consulta horarios libres y reserva en Cal.com (llave CALCOM_API_KEY como secreto). */
  booking: z
    .object({
      enabled: z.boolean().default(false),
      eventTypeId: z.number().int().positive().nullable().default(null),
    })
    .default({ enabled: false, eventTypeId: null }),
  /** Cobros: link de pago de Stripe (llaves STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET como secretos). */
  payments: z
    .object({
      enabled: z.boolean().default(false),
      /** Código ISO de la moneda en minúsculas (clp, mxn, usd, eur…). */
      currency: z.string().trim().toLowerCase().length(3).default("usd"),
      /** Monto máximo por link (protección). `null` = sin tope. */
      maxAmount: z.number().positive().nullable().default(null),
    })
    .default({ enabled: false, currency: "usd", maxAmount: null }),
});
export type BotSettings = z.infer<typeof botSettingsSchema>;

export function defaultBotSettings(): BotSettings {
  return botSettingsSchema.parse({});
}
