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
});
export type BotSettings = z.infer<typeof botSettingsSchema>;

export function defaultBotSettings(): BotSettings {
  return botSettingsSchema.parse({});
}
