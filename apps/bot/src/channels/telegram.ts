import { timingSafeEqual } from "../lib/crypto.js";

/** Subconjunto del Update de la Bot API de Telegram que usamos. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    voice?: unknown;
    photo?: unknown[];
    chat: { id: number; type: string };
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
    };
  };
}

export interface TelegramInbound {
  chatId: string;
  name?: string;
  text: string;
  hasUnsupportedMedia: boolean;
}

export function verifyTelegramSecret(
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return typeof header === "string" && timingSafeEqual(header, secret);
}

/** Normaliza un update. Solo chats privados con mensajes de personas. */
export function parseTelegramUpdate(update: TelegramUpdate): TelegramInbound | null {
  const msg = update.message;
  if (msg?.chat.type !== "private" || msg.from?.is_bot) return null;
  const name =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username;
  const text = (msg.text ?? msg.caption ?? "").trim();
  return {
    chatId: String(msg.chat.id),
    ...(name ? { name } : {}),
    text,
    hasUnsupportedMedia: Boolean(msg.voice || msg.photo),
  };
}

/** Envía un mensaje; los botones van como teclado de respuesta rápida (se oculta al tocar). */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  buttons: string[] = [],
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      ...(buttons.length
        ? {
            reply_markup: {
              keyboard: buttons.map((b) => [{ text: b }]),
              one_time_keyboard: true,
              resize_keyboard: true,
            },
          }
        : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Telegram respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
