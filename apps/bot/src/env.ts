/** Bindings, variables y secretos del Worker. Los secretos se cargan con `wrangler secret put`. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Workers AI (embeddings). Ausente en desarrollo local. */
  AI?: Ai;
  /** Índice Vectorize de la base de conocimiento. Ausente en desarrollo local. */
  VECTORIZE?: Vectorize;

  // variables (wrangler.jsonc)
  BOT_NAME?: string;
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
}

export const APP_VERSION = "0.1.0";
