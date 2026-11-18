import { buttonsAsText } from "@yunque/core";
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

/** WhatsApp vía Twilio. Twilio firma: base64(HMAC-SHA1(token, URL + parámetros ordenados)). */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null | undefined,
  authToken: string | undefined,
): Promise<boolean> {
  if (!authToken || !header) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return timingSafeEqual(header, await hmac("SHA-1", authToken, data, "base64"));
}

/** `whatsapp:+5215512345678` → `5215512345678` (mismo identificador que la Cloud API). */
export function phoneFromTwilio(address: string): string {
  return address.replace(/^whatsapp:/, "").replace(/^\+/, "");
}

export function parseTwilioWebhook(
  params: Record<string, string>,
  credentials: { accountSid: string; authToken: string },
): InboundEnvelope | null {
  const from = params.From;
  if (!from?.startsWith("whatsapp:")) return null;
  const media: MediaRef[] = [];
  const count = Number(params.NumMedia ?? 0) || 0;
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    const type = params[`MediaContentType${i}`] ?? "";
    if (!url) continue;
    media.push({
      kind: type.startsWith("image/") ? "image" : type.startsWith("audio/") ? "audio" : "other",
      mimeType: type,
      download: async () => {
        const res = await fetch(url, {
          headers: {
            authorization: `Basic ${btoa(`${credentials.accountSid}:${credentials.authToken}`)}`,
          },
        });
        if (!res.ok) throw new Error(`Twilio no entregó el adjunto (${res.status})`);
        return { data: await res.arrayBuffer(), mimeType: res.headers.get("content-type") ?? type };
      },
    });
  }
  return {
    channel: "whatsapp",
    externalUserId: phoneFromTwilio(from),
    ...(params.ProfileName ? { userName: params.ProfileName } : {}),
    text: (params.ButtonText ?? params.Body ?? "").trim(),
    ...(media.length ? { media } : {}),
  };
}

export class TwilioWhatsAppSender implements ChannelSender {
  readonly channel = "whatsapp" as const;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    /** Número emisor, p. ej. `whatsapp:+14155238886`. */
    private readonly from: string,
  ) {}

  private async post(fields: Record<string, string>): Promise<void> {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${this.accountSid}:${this.authToken}`)}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields),
      },
    );
    if (!res.ok)
      throw new Error(`Twilio respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  async send(to: string, message: OutboundMessage, context: SendContext): Promise<void> {
    const address = `whatsapp:+${to}`;
    if (!insideWhatsAppWindow(context)) {
      // En Twilio las plantillas se mandan con su ContentSid; se configura como nombre de plantilla.
      if (!message.template) throw new OutsideWindowError();
      await this.post({
        From: this.from,
        To: address,
        ContentSid: message.template.name,
        ...(message.template.params?.length
          ? {
              ContentVariables: JSON.stringify(
                Object.fromEntries(message.template.params.map((v, i) => [String(i + 1), v])),
              ),
            }
          : {}),
      });
      return;
    }
    // Twilio no tiene botones libres sin plantilla: van como lista numerada.
    const text = buttonsAsText(message.text, message.buttons ?? []);
    if (text) await this.post({ From: this.from, To: address, Body: text.slice(0, 1600) });
    for (const m of message.media ?? []) {
      await this.post({
        From: this.from,
        To: address,
        MediaUrl: m.url,
        ...(m.caption ? { Body: m.caption } : {}),
      });
    }
  }
}
