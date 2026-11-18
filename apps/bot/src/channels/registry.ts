import type { Channel } from "@yunque/core";
import type { Env } from "../env.js";
import { MetaMessagingSender, WhatsAppCloudSender } from "./meta.js";
import { TelegramSender } from "./telegram.js";
import { TwilioWhatsAppSender } from "./twilio.js";
import type { ChannelSender, OutboundMessage, SendContext } from "./types.js";

export type ChannelSenders = Partial<Record<Channel, ChannelSender>>;

/** Arma los emisores de los canales que tienen sus secretos configurados. */
export function createSenders(env: Env): ChannelSenders {
  const senders: ChannelSenders = {};
  if (env.TELEGRAM_BOT_TOKEN) senders.telegram = new TelegramSender(env.TELEGRAM_BOT_TOKEN);
  if (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    senders.whatsapp = new WhatsAppCloudSender(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID);
  } else if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM) {
    senders.whatsapp = new TwilioWhatsAppSender(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_WHATSAPP_FROM,
    );
  }
  if (env.META_PAGE_TOKEN) {
    senders.messenger = new MetaMessagingSender("messenger", env.META_PAGE_TOKEN);
    senders.instagram = new MetaMessagingSender("instagram", env.META_PAGE_TOKEN);
  }
  return senders;
}

export type DeliveryResult = { delivered: true } | { delivered: false; reason: string };

/**
 * Entrega un mensaje saliente. El chat web y el canal de prueba no "empujan": el widget recoge
 * los mensajes al consultar, así que cuentan como entregados.
 */
export async function deliver(
  senders: ChannelSenders,
  channel: Channel,
  externalUserId: string,
  message: OutboundMessage,
  context: SendContext,
): Promise<DeliveryResult> {
  if (channel === "web" || channel === "playground") return { delivered: true };
  const sender = senders[channel];
  if (!sender) return { delivered: false, reason: `El canal ${channel} no está conectado` };
  try {
    await sender.send(externalUserId, message, context);
    return { delivered: true };
  } catch (error) {
    return { delivered: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export interface ChannelStatus {
  channel: Channel;
  configured: boolean;
  /** Secretos que faltan para conectarlo. */
  missing: string[];
  webhookPath: string | null;
}

/** Estado de cada canal para la pestaña Conexiones (nunca expone valores de secretos). */
export function channelStatuses(env: Env): ChannelStatus[] {
  const need = (names: Array<keyof Env>) => names.filter((n) => !env[n]) as string[];
  const whatsappCloud = need([
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "META_APP_SECRET",
    "META_VERIFY_TOKEN",
  ]);
  const whatsappTwilio = need(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]);
  const whatsappReady = whatsappCloud.length === 0 || whatsappTwilio.length === 0;
  const meta = need(["META_PAGE_TOKEN", "META_APP_SECRET", "META_VERIFY_TOKEN"]);
  const telegram = need(["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]);
  return [
    { channel: "web", configured: true, missing: [], webhookPath: null },
    {
      channel: "telegram",
      configured: telegram.length === 0,
      missing: telegram,
      webhookPath: "/webhooks/telegram",
    },
    {
      channel: "whatsapp",
      configured: whatsappReady,
      missing: whatsappReady ? [] : whatsappCloud,
      webhookPath:
        whatsappTwilio.length === 0 && whatsappCloud.length > 0
          ? "/webhooks/twilio"
          : "/webhooks/meta",
    },
    {
      channel: "instagram",
      configured: meta.length === 0,
      missing: meta,
      webhookPath: "/webhooks/meta",
    },
    {
      channel: "messenger",
      configured: meta.length === 0,
      missing: meta,
      webhookPath: "/webhooks/meta",
    },
  ];
}
