import { systemMessage } from "@yunque/core";
import { type Context, Hono } from "hono";
import { verifyStripeSignature } from "../integrations/providers.js";
import type { AppEnv } from "../types.js";
import { processInbound } from "./inbound.js";
import {
  type MetaWebhookBody,
  parseMessagingWebhook,
  parseWhatsAppWebhook,
  verifyMetaChallenge,
  verifyMetaSignature,
} from "./meta.js";
import { deliver } from "./registry.js";
import { parseTelegramUpdate, type TelegramUpdate, verifyTelegramSecret } from "./telegram.js";
import { parseTwilioWebhook, verifyTwilioSignature } from "./twilio.js";
import type { InboundEnvelope } from "./types.js";

/** Webhooks de los canales. Todos responden enseguida y procesan en segundo plano (los canales reintentan si tardamos). */
export const webhooks = new Hono<AppEnv>();

function runInBackground(c: Context<AppEnv>, inbound: InboundEnvelope[]): void {
  const services = c.get("services");
  const work = (async () => {
    for (const message of inbound) {
      try {
        await processInbound(services, message);
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "inbound_error",
            channel: message.channel,
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  })();
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // fuera de Workers (tests) no hay executionCtx: la promesa sigue igual
  }
}

// ---------- Telegram ----------

webhooks.post("/telegram", async (c) => {
  if (
    !verifyTelegramSecret(
      c.req.header("x-telegram-bot-api-secret-token"),
      c.env.TELEGRAM_WEBHOOK_SECRET,
    )
  ) {
    return c.json({ error: "No autorizado" }, 401);
  }
  const token = c.env.TELEGRAM_BOT_TOKEN;
  const inbound = token ? parseTelegramUpdate((await c.req.json()) as TelegramUpdate, token) : null;
  if (inbound) runInBackground(c, [inbound]);
  return c.json({ ok: true });
});

// ---------- Meta: WhatsApp Cloud API, Instagram y Messenger ----------

webhooks.get("/meta", (c) => {
  const challenge = verifyMetaChallenge(new URL(c.req.url).searchParams, c.env.META_VERIFY_TOKEN);
  return challenge ? c.text(challenge) : c.text("Verificación inválida", 403);
});

webhooks.post("/meta", async (c) => {
  const raw = await c.req.text();
  if (
    !(await verifyMetaSignature(raw, c.req.header("x-hub-signature-256"), c.env.META_APP_SECRET))
  ) {
    return c.json({ error: "Firma inválida" }, 401);
  }
  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw) as MetaWebhookBody;
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }
  const inbound =
    body.object === "whatsapp_business_account"
      ? c.env.WHATSAPP_TOKEN
        ? parseWhatsAppWebhook(body, c.env.WHATSAPP_TOKEN)
        : []
      : body.object === "page" || body.object === "instagram"
        ? parseMessagingWebhook(body, c.env.META_APP_ID)
        : [];
  if (inbound.length) runInBackground(c, inbound);
  return c.json({ ok: true });
});

// ---------- WhatsApp vía Twilio ----------

webhooks.post("/twilio", async (c) => {
  const form = await c.req.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") params[key] = value;
  });
  const publicUrl = c.env.PUBLIC_URL
    ? `${c.env.PUBLIC_URL.replace(/\/$/, "")}/webhooks/twilio`
    : c.req.url;
  if (
    !(await verifyTwilioSignature(
      publicUrl,
      params,
      c.req.header("x-twilio-signature"),
      c.env.TWILIO_AUTH_TOKEN,
    ))
  ) {
    return c.text("Firma inválida", 401);
  }
  const inbound =
    c.env.TWILIO_ACCOUNT_SID && c.env.TWILIO_AUTH_TOKEN
      ? parseTwilioWebhook(params, {
          accountSid: c.env.TWILIO_ACCOUNT_SID,
          authToken: c.env.TWILIO_AUTH_TOKEN,
        })
      : null;
  if (inbound) runInBackground(c, [inbound]);
  // respuesta vacía: contestamos por la API, no por TwiML
  return c.body("<Response></Response>", 200, { "content-type": "text/xml" });
});

// ---------- Stripe: pago confirmado ----------

webhooks.post("/stripe", async (c) => {
  const raw = await c.req.text();
  if (
    !(await verifyStripeSignature(
      raw,
      c.req.header("stripe-signature"),
      c.env.STRIPE_WEBHOOK_SECRET,
    ))
  ) {
    return c.json({ error: "Firma inválida" }, 400);
  }
  const event = JSON.parse(raw) as {
    type?: string;
    data?: { object?: { id?: string; payment_status?: string } };
  };
  const session = event.data?.object;
  if (
    event.type !== "checkout.session.completed" ||
    !session?.id ||
    session.payment_status === "unpaid"
  ) {
    return c.json({ received: true });
  }
  const services = c.get("services");
  const payment = await services.integrations.paymentBySession(session.id);
  if (!payment || !(await services.integrations.markPaid(session.id)))
    return c.json({ received: true });

  const work = (async () => {
    const { profile } = await services.config();
    const amount = `${profile.currency}${payment.amount.toLocaleString("es")} ${payment.currency.toUpperCase()}`;
    await services.notifier
      .notify({
        title: "💳 Pago recibido",
        body: `${payment.concept} · ${amount}`,
        ...(payment.conversationId ? { path: `/admin/bandeja/${payment.conversationId}` } : {}),
      })
      .catch(() => undefined);
    const contact = await services.store.getContact(payment.contactId);
    const conversation = payment.conversationId
      ? await services.store.getConversation(payment.conversationId)
      : null;
    if (contact && conversation) {
      const text = systemMessage(profile.language, "paymentReceived").replace("{monto}", amount);
      const sent = await deliver(
        services.senders,
        conversation.channel,
        contact.externalId,
        { text },
        {
          lastCustomerMessageAt: conversation.lastCustomerMessageAt,
          now: Date.now(),
        },
      );
      if (sent.delivered) {
        await services.store.addMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: text,
          meta: { kind: "pago" },
        });
      }
      await services.store.upsertLead({
        contactId: contact.id,
        conversationId: conversation.id,
        interest: payment.concept,
      });
      const lead = (await services.store.listLeads(500)).find((l) => l.contactId === contact.id);
      if (lead) await services.store.updateLead(lead.id, { status: "ganado" });
    }
  })().catch((error: unknown) =>
    console.error(JSON.stringify({ message: "stripe_error", detail: String(error) })),
  );
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    // tests
  }
  return c.json({ received: true });
});
