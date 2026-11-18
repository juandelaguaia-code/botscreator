/** Bindings, variables y secretos del Worker. Los secretos se cargan con `wrangler secret put`. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Workers AI (embeddings). Ausente en desarrollo local. */
  AI?: Ai;
  /** Índice Vectorize de la base de conocimiento. Ausente en desarrollo local. */
  VECTORIZE?: Vectorize;
  /** Archivos de la Galería (R2). */
  MEDIA?: R2Bucket;

  // variables (wrangler.jsonc)
  BOT_NAME?: string;
  /** Valores iniciales del perfil mientras el dueño no guarda el suyo (los pone el instalador). */
  BOT_GIRO?: string;
  BOT_LANGUAGE?: string;
  BOT_CURRENCY?: string;
  BOT_TIMEZONE?: string;
  LLM_PROVIDER?: string;
  /** URL pública del bot, para links en avisos (https://mi-bot.cuenta.workers.dev). */
  PUBLIC_URL?: string;

  // secretos
  DASHBOARD_PASSWORD?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  OWNER_TELEGRAM_CHAT_ID?: string;

  // Meta (WhatsApp Cloud API, Instagram, Messenger)
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  /** Id de la app de Meta: distingue nuestros envíos de los de una persona en la bandeja de Meta. */
  META_APP_ID?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  /** Token de página (Messenger e Instagram). */
  META_PAGE_TOKEN?: string;

  // WhatsApp vía Twilio
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  /** Emisor, p. ej. whatsapp:+14155238886 */
  TWILIO_WHATSAPP_FROM?: string;

  // Avisos por correo (Resend)
  RESEND_API_KEY?: string;
  OWNER_EMAIL?: string;
  EMAIL_FROM?: string;

  // Integraciones
  CALCOM_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  /** Token para que tu central de agencia lea y opere este bot (Authorization: Bearer). */
  AGENCY_TOKEN?: string;
}

export const APP_VERSION = "0.1.0";
