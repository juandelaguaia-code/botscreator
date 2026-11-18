import { systemMessage } from "@yunque/core";
import type { Services } from "../services.js";
import { processMedia } from "./media.js";
import { deliver } from "./registry.js";
import type { InboundEnvelope } from "./types.js";

/**
 * Flujo común para todo mensaje entrante de un canal con webhook (WhatsApp, Instagram, Messenger,
 * Telegram): oído y vista → motor → entrega de la respuesta por el mismo canal.
 */
export async function processInbound(services: Services, inbound: InboundEnvelope): Promise<void> {
  const { engine, senders, config, transcriber } = services;

  // Una persona del negocio contestó desde la app del canal: el bot se aparta.
  if (inbound.fromBusinessHuman) {
    await engine.recordBusinessReply(inbound.channel, inbound.externalUserId, inbound.text);
    return;
  }

  const now = Date.now();
  const context = { lastCustomerMessageAt: now, now };
  const media = await processMedia(inbound.media, transcriber);
  const text = [inbound.text, ...media.extraText].filter(Boolean).join("\n").trim();

  if (!text && media.images.length === 0) {
    if (media.unsupported > 0) {
      const { profile } = await config();
      await deliver(
        senders,
        inbound.channel,
        inbound.externalUserId,
        { text: systemMessage(profile.language, "unsupportedMedia") },
        context,
      );
    }
    return;
  }

  const result = await engine.handleInbound({
    channel: inbound.channel,
    externalUserId: inbound.externalUserId,
    text,
    ...(inbound.userName ? { userName: inbound.userName } : {}),
    ...(media.images.length ? { images: media.images } : {}),
  });

  if (result.reply) {
    const sent = await deliver(
      senders,
      inbound.channel,
      inbound.externalUserId,
      { text: result.reply, buttons: result.buttons, media: result.attachments },
      context,
    );
    if (!sent.delivered) {
      console.error(
        JSON.stringify({
          message: "delivery_failed",
          channel: inbound.channel,
          reason: sent.reason,
        }),
      );
    }
  } else if (result.skipped === "rate_limited") {
    const { profile } = await config();
    await deliver(
      senders,
      inbound.channel,
      inbound.externalUserId,
      { text: systemMessage(profile.language, "rateLimited") },
      context,
    );
  }
}
