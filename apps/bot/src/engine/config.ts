import {
  type BotSettings,
  type BusinessProfile,
  botSettingsSchema,
  businessProfileSchema,
  defaultBotSettings,
  defaultBusinessProfile,
  providerSchema,
} from "@yunque/core";
import type { Store } from "../store/types.js";

export const SETTINGS_KEYS = {
  profile: "business_profile",
  settings: "bot_settings",
} as const;

export interface ConfigDefaults {
  botName?: string;
  provider?: string;
}

/**
 * Lee la configuración del bot desde `settings`. Si un valor guardado ya no es válido (p. ej.
 * tras una actualización de esquema), se combina con los defaults en vez de romper el bot.
 */
export async function loadConfig(
  store: Store,
  defaults: ConfigDefaults = {},
): Promise<{ profile: BusinessProfile; settings: BotSettings }> {
  const [rawProfile, rawSettings] = await Promise.all([
    store.getSetting<unknown>(SETTINGS_KEYS.profile),
    store.getSetting<unknown>(SETTINGS_KEYS.settings),
  ]);

  const baseProfile = defaultBusinessProfile(defaults.botName?.trim() || "Mi negocio");
  const profileParsed = businessProfileSchema.safeParse({
    ...baseProfile,
    ...(asObject(rawProfile) ?? {}),
  });

  const providerDefault = providerSchema.safeParse(defaults.provider);
  const baseSettings: BotSettings = {
    ...defaultBotSettings(),
    ...(providerDefault.success ? { provider: providerDefault.data } : {}),
  };
  const settingsParsed = botSettingsSchema.safeParse({
    ...baseSettings,
    ...(asObject(rawSettings) ?? {}),
  });

  return {
    profile: profileParsed.success ? profileParsed.data : baseProfile,
    settings: settingsParsed.success ? settingsParsed.data : baseSettings,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
