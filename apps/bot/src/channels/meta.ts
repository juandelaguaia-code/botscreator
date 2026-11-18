import type { Channel } from "@yunque/core";
import { hmac, timingSafeEqual } from "../lib/crypto.js";
import {
  type ChannelSender,
  type InboundEnvelope,
  insideWhatsAppWindow,
  type MediaRef,
  type OutboundMessage,
  OutsideWindowError,
  type SendContext,
} from "./types.js";

/**
 * Meta: WhatsApp Cloud API, Instagram y Messenger comparten app, verificación y firma.
 * Un solo webhook (`/webhooks/meta`) recibe los tres.
 */

export const GRAPH = "https://graph.facebook.com/v21.0";

/** GET de verificación al registrar el webhook en Meta. */
export function verifyMetaChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): string | null {
  if (!verifyToken) return null;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  return mode === "subscribe" && challenge && timingSafeEqual(token, verifyToken)
    ? challenge
    : null;
}

/** Firma `X-Hub-Signature-256: sha256=<hex>` sobre el cuerpo crudo, con el secreto de la app. */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string | undefined,
) {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = await hmac("SHA-256", appSecret, rawBody, "hex");
  return timingSafeEqual(header.slice("sha256=".length), expected);
}

async function graphFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Meta respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

// ---------- WhatsApp Cloud API ----------

interface WhatsAppValue {
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: Array<{
    from: string;
    type: string;
    text?: { body?: string };
    image?: { id: string; mime_type?: string; caption?: string };
    audio?: { id: string; mime_type?: string };
    video?: { id: string };
    document?: { id: string };
    sticker?: { id: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    button?: { text?: string };
  }>;
}

export interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WhatsAppValue }>;
    messaging?: MessagingEvent[];
  }>;
}

function whatsAppMedia(
  id: string,
  kind: MediaRef["kind"],
  token: string,
  mimeType?: string,
): MediaRef {
  return {
    kind,
    ...(mimeType ? { mimeType } : {}),
    download: async () => {
      const meta = (await (await graphFetch(`${GRAPH}/${id}`, token)).json()) as {
        url: string;
        mime_type?: string;
      };
      const file = await graphFetch(meta.url, token);
      return {
        data: await file.arrayBuffer(),
        mimeType: meta.mime_type ?? mimeType ?? "application/octet-stream",
      };
    },
  };
}

export function parseWhatsAppWebhook(body: MetaWebhookBody, token: string): InboundEnvelope[] {
  const out: InboundEnvelope[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const name = value.contacts?.[0]?.profile?.name;
      for (const m of value.messages) {
        const media: MediaRef[] = [];
        let text = "";
        if (m.type === "text") text = m.text?.body ?? "";
        else if (m.type === "interactive")
          text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        else if (m.type === "button") text = m.button?.text ?? "";
        else if (m.type === "image" && m.image) {
          text = m.image.caption ?? "";
          media.push(whatsAppMedia(m.image.id, "image", token, m.image.mime_type));
        } else if (m.type === "audio" && m.audio)
          media.push(whatsAppMedia(m.audio.id, "audio", token, m.audio.mime_type));
        else
          media.push({
            kind: "other",
            download: async () => Promise.reject(new Error("no soportado")),
          });
        out.push({
          channel: "whatsapp",
          externalUserId: m.from,
          ...(name ? { userName: name } : {}),
          text,
          ...(media.length ? { media } : {}),
        });
      }
    }
  }
  return out;
}

export class WhatsAppCloudSender implements ChannelSender {
  readonly channel = "whatsapp" as const;

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  private post(payload: Record<string, unknown>) {
    return graphFetch(`${GRAPH}/${this.phoneNumberId}/messages`, this.token, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
  }

  async send(to: string, message: OutboundMessage, context: SendContext): Promise<void> {
    if (!insideWhatsAppWindow(context)) {
      if (!message.template) throw new OutsideWindowError();
      await this.post({
        to,
        type: "template",
        template: {
          name: message.template.name,
          language: { code: message.template.language },
          ...(message.template.params?.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: message.template.params.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      });
      return;
    }

    const buttons = message.buttons ?? [];
    if (buttons.length > 0) {
      await this.post({
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.text.slice(0, 1024) },
          action: {
            buttons: buttons.slice(0, 3).map((title, i) => ({
              type: "reply",
              reply: { id: `op_${i + 1}`, title: title.slice(0, 20) },
            })),
          },
        },
      });
    } else if (message.text) {
      await this.post({ to, type: "text", text: { body: message.text.slice(0, 4096) } });
    }
    for (const m of message.media ?? []) {
      await this.post({
        to,
        type: m.kind,
        [m.kind]: {
          link: m.url,
          ...(m.caption && m.kind !== "audio" ? { caption: m.caption } : {}),
        },
      });
    }
  }
}

// ---------- Messenger e Instagram ----------

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    text?: string;
    is_echo?: boolean;
    app_id?: number | string;
    quick_reply?: { payload?: string };
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
  postback?: { title?: string; payload?: string };
}

function urlMedia(url: string, kind: MediaRef["kind"]): MediaRef {
  return {
    kind,
    download: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo descargar el adjunto (${res.status})`);
      return {
        data: await res.arrayBuffer(),
        mimeType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    },
  };
}

/**
 * Messenger (`object: "page"`) e Instagram (`object: "instagram"`). Los "ecos" son mensajes que
 * salieron de la página: si no los mandó nuestra app, los escribió una persona desde la bandeja de
 * Meta y el bot debe apartarse.
 */
export function parseMessagingWebhook(body: MetaWebhookBody, ownAppId?: string): InboundEnvelope[] {
  const channel: Channel = body.object === "instagram" ? "instagram" : "messenger";
  const out: InboundEnvelope[] = [];
  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      if (msg?.is_echo) {
        const customer = ev.recipient?.id;
        const fromOurApp = ownAppId !== undefined && String(msg.app_id ?? "") === ownAppId;
        if (customer && !fromOurApp) {
          out.push({
            channel,
            externalUserId: customer,
            text: msg.text ?? "",
            fromBusinessHuman: true,
          });
        }
        continue;
      }
      const sender = ev.sender?.id;
      if (!sender) continue;
      const media: MediaRef[] = [];
      for (const a of msg?.attachments ?? []) {
        if (!a.payload?.url) continue;
        media.push(
          urlMedia(
            a.payload.url,
            a.type === "image" ? "image" : a.type === "audio" ? "audio" : "other",
          ),
        );
      }
      const text = msg?.text ?? ev.postback?.title ?? "";
      if (!text && media.length === 0) continue;
      out.push({ channel, externalUserId: sender, text, ...(media.length ? { media } : {}) });
    }
  }
  return out;
}

export class MetaMessagingSender implements ChannelSender {
  constructor(
    readonly channel: "messenger" | "instagram",
    private readonly pageToken: string,
  ) {}

  private post(recipient: string, message: Record<string, unknown>) {
    return graphFetch(`${GRAPH}/me/messages`, this.pageToken, {
      method: "POST",
      body: JSON.stringify({ recipient: { id: recipient }, messaging_type: "RESPONSE", message }),
    });
  }

  async send(to: string, message: OutboundMessage): Promise<void> {
    const buttons = message.buttons ?? [];
    if (message.text) {
      // las respuestas rápidas son los botones nativos de Messenger e Instagram
      await this.post(to, {
        text: message.text.slice(0, 1000),
        ...(buttons.length
          ? {
              quick_replies: buttons.slice(0, 13).map((title) => ({
                content_type: "text",
                title: title.slice(0, 20),
                payload: title,
              })),
            }
          : {}),
      });
    }
    for (const m of message.media ?? []) {
      const type = m.kind === "document" ? "file" : m.kind;
      await this.post(to, { attachment: { type, payload: { url: m.url, is_reusable: true } } });
    }
  }
}
