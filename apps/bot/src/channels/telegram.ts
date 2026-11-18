import { timingSafeEqual } from "../lib/crypto.js";
import type { ChannelSender, InboundEnvelope, MediaRef, OutboundMessage } from "./types.js";

const API = "https://api.telegram.org";

/** Subconjunto del Update de la Bot API de Telegram que usamos. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    voice?: { file_id: string; mime_type?: string };
    audio?: { file_id: string; mime_type?: string };
    photo?: Array<{ file_id: string; width?: number }>;
    document?: { file_id: string; mime_type?: string };
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

export function verifyTelegramSecret(
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  return typeof header === "string" && timingSafeEqual(header, secret);
}

function telegramFile(
  token: string,
  fileId: string,
  kind: MediaRef["kind"],
  mimeType?: string,
): MediaRef {
  return {
    kind,
    ...(mimeType ? { mimeType } : {}),
    download: async () => {
      const info = (await (
        await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
      ).json()) as {
        ok: boolean;
        result?: { file_path?: string };
      };
      if (!info.ok || !info.result?.file_path) throw new Error("Telegram no entregó el archivo");
      const file = await fetch(`${API}/file/bot${token}/${info.result.file_path}`);
      if (!file.ok) throw new Error(`Descarga fallida (${file.status})`);
      const fallback = kind === "image" ? "image/jpeg" : (mimeType ?? "application/octet-stream");
      return {
        data: await file.arrayBuffer(),
        mimeType: mimeType ?? file.headers.get("content-type") ?? fallback,
      };
    },
  };
}

/** Normaliza un update. Solo chats privados con mensajes de personas. */
export function parseTelegramUpdate(update: TelegramUpdate, token: string): InboundEnvelope | null {
  const msg = update.message;
  if (msg?.chat.type !== "private" || msg.from?.is_bot) return null;
  const name =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username;
  const media: MediaRef[] = [];
  const voice = msg.voice ?? msg.audio;
  if (voice)
    media.push(telegramFile(token, voice.file_id, "audio", voice.mime_type ?? "audio/ogg"));
  const photo = msg.photo?.at(-1); // la versión más grande
  if (photo) media.push(telegramFile(token, photo.file_id, "image"));
  if (msg.document)
    media.push(telegramFile(token, msg.document.file_id, "other", msg.document.mime_type));
  return {
    channel: "telegram",
    externalUserId: String(msg.chat.id),
    ...(name ? { userName: name } : {}),
    text: (msg.text ?? msg.caption ?? "").trim(),
    ...(media.length ? { media } : {}),
  };
}

async function call(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw new Error(`Telegram respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Envía un texto; los botones van como teclado de respuesta rápida (se oculta al tocar). */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  buttons: string[] = [],
) {
  await call(token, "sendMessage", {
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
  });
}

const MEDIA_METHOD = {
  image: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  document: ["sendDocument", "document"],
} as const;

export class TelegramSender implements ChannelSender {
  readonly channel = "telegram" as const;

  constructor(private readonly token: string) {}

  async send(chatId: string, message: OutboundMessage): Promise<void> {
    if (message.text)
      await sendTelegramMessage(this.token, chatId, message.text, message.buttons ?? []);
    for (const m of message.media ?? []) {
      const [method, field] = MEDIA_METHOD[m.kind];
      await call(this.token, method, {
        chat_id: chatId,
        [field]: m.url,
        ...(m.caption ? { caption: m.caption } : {}),
      });
    }
  }
}
