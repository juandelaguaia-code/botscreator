import type { Channel } from "@yunque/core";

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 60) return "ahora";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(diff / 86_400), "day");
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  web: "Web",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  playground: "Prueba",
};

export function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

/** Pausas muy lejanas significan "hasta reactivar". */
export function pauseLabel(pausedUntil: number): string {
  if (pausedUntil > Date.now() + 365 * 86_400_000) return "pausado hasta reactivar";
  return `pausado hasta las ${clockTime(pausedUntil)}`;
}
