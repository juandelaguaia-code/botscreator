/**
 * Listas que el instalador valida. Viven aquí (y no importadas de `@yunque/core`) para que el CLI corra
 * con Node sin compilar; un test comprueba que coinciden con las del núcleo.
 */
export const GIROS = [
  "general",
  "restaurante",
  "cafeteria",
  "panaderia",
  "barberia",
  "salon",
  "spa",
  "dentista",
  "clinica",
  "gimnasio",
  "coach",
  "inmobiliaria",
  "tienda",
  "ventas",
  "hoteleria",
] as const;

export const LANGUAGES = ["es-419", "es-ES", "en", "pt-BR", "espejo"] as const;

export const PROVIDERS = ["anthropic", "openai", "xai", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Llave que necesita cada proveedor de IA. */
export const PROVIDER_SECRET: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Secretos sin los que el bot no funciona. */
export function requiredSecrets(provider: Provider): string[] {
  return ["DASHBOARD_PASSWORD", PROVIDER_SECRET[provider]];
}

/** Secretos opcionales que conviene tener, con lo que activan. */
export const OPTIONAL_SECRETS: Array<{ names: string[]; enables: string }> = [
  { names: ["TELEGRAM_BOT_TOKEN"], enables: "canal Telegram" },
  { names: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"], enables: "WhatsApp (Meta)" },
  { names: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"], enables: "WhatsApp (Twilio)" },
  { names: ["RESEND_API_KEY", "EMAIL_FROM"], enables: "avisos y recuperación por correo" },
  { names: ["AGENCY_TOKEN"], enables: "vínculo con tu central de agencia" },
];
