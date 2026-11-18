import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  verifyMetaChallenge,
  verifyMetaSignature,
  WhatsAppCloudSender,
} from "../src/channels/meta.js";
import { TwilioWhatsAppSender, verifyTwilioSignature } from "../src/channels/twilio.js";
import { OutsideWindowError } from "../src/channels/types.js";
import type { Env } from "../src/env.js";
import { hmac } from "../src/lib/crypto.js";
import { D1Store } from "../src/store/d1.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

interface Call {
  url: string;
  method: string;
  body: string;
}

/** Simula las APIs externas (Graph, Twilio, Telegram) y registra cada llamada. */
function mockFetch(routes: Array<[RegExp, () => Response]> = []) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body =
      init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
    calls.push({ url, method: init?.method ?? "GET", body });
    for (const [pattern, respond] of routes) if (pattern.test(url)) return respond();
    return Response.json({ ok: true, messages: [{ id: "wamid.1" }] });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

function setup(extra: Partial<Env> = {}) {
  const env = {
    DB: createTestD1(),
    DASHBOARD_PASSWORD: "clave",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Taller Fierro",
    META_APP_SECRET: "secreto-app",
    META_VERIFY_TOKEN: "token-verificacion",
    META_APP_ID: "111",
    WHATSAPP_TOKEN: "wa-token",
    WHATSAPP_PHONE_NUMBER_ID: "555",
    META_PAGE_TOKEN: "page-token",
    ...extra,
  } as Env;
  const app = createApp();
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => pending.push(p),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  const request = async (path: string, init: RequestInit = {}) => {
    const res = await app.request(path, init, env, ctx);
    await Promise.all(pending.splice(0));
    return res;
  };
  return { env, request, store: new D1Store(env.DB) };
}

async function signedMeta(body: unknown, secret = "secreto-app"): Promise<RequestInit> {
  const raw = JSON.stringify(body);
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${await hmac("SHA-256", secret, raw, "hex")}`,
    },
    body: raw,
  };
}

const whatsappText = (text: string, from = "5215512345678") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            contacts: [{ wa_id: from, profile: { name: "Luis" } }],
            messages: [{ from, type: "text", text: { body: text } }],
          },
        },
      ],
    },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe("Meta · verificación", () => {
  it("responde el challenge solo con el token correcto", () => {
    const ok = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "t",
      "hub.challenge": "42",
    });
    expect(verifyMetaChallenge(ok, "t")).toBe("42");
    expect(verifyMetaChallenge(ok, "otro")).toBeNull();
    expect(verifyMetaChallenge(ok, undefined)).toBeNull();
  });

  it("valida la firma X-Hub-Signature-256", async () => {
    const sig = `sha256=${await hmac("SHA-256", "s", "{}", "hex")}`;
    expect(await verifyMetaSignature("{}", sig, "s")).toBe(true);
    expect(await verifyMetaSignature("{ }", sig, "s")).toBe(false);
    expect(await verifyMetaSignature("{}", undefined, "s")).toBe(false);
  });

  it("el webhook GET devuelve el challenge y rechaza firmas falsas", async () => {
    const { request } = setup();
    const res = await request(
      "/webhooks/meta?hub.mode=subscribe&hub.verify_token=token-verificacion&hub.challenge=abc",
    );
    expect(await res.text()).toBe("abc");
    const bad = await request("/webhooks/meta", {
      ...(await signedMeta(whatsappText("hola"), "otro-secreto")),
    });
    expect(bad.status).toBe(401);
  });
});

describe("WhatsApp Cloud API", () => {
  it("recibe un texto, responde por la Graph API y registra la conversación", async () => {
    const calls = mockFetch();
    const { request, store } = setup();
    const res = await request(
      "/webhooks/meta",
      await signedMeta(whatsappText("¿A qué hora abren?")),
    );
    expect(res.status).toBe(200);

    const send = calls.find((c) => c.url.endsWith("/555/messages"));
    expect(send).toBeDefined();
    const payload = JSON.parse(send?.body ?? "{}");
    expect(payload).toMatchObject({
      messaging_product: "whatsapp",
      to: "5215512345678",
      type: "text",
    });
    expect(payload.text.body).toContain("Recibí");

    const [conv] = await store.listConversations("all", 5);
    expect(conv).toMatchObject({ channel: "whatsapp", contactName: "Luis" });
  });

  it("transcribe una nota de voz con Workers AI antes de responder", async () => {
    const calls = mockFetch([
      [
        /graph\.facebook\.com\/v21\.0\/media-1$/,
        () => Response.json({ url: "https://lookaside.example/audio", mime_type: "audio/ogg" }),
      ],
      [
        /lookaside\.example\/audio/,
        () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/ogg" } }),
      ],
    ]);
    const ai = { run: vi.fn(async () => ({ text: "quiero cotizar unas balatas" })) };
    const { request, store } = setup({ AI: ai as unknown as Ai });
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "521", type: "audio", audio: { id: "media-1", mime_type: "audio/ogg" } },
                ],
              },
            },
          ],
        },
      ],
    };
    await request("/webhooks/meta", await signedMeta(body));
    expect(ai.run).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({ audio: expect.any(String) }),
    );
    const [conv] = await store.listConversations("all", 5);
    const messages = await store.listMessages(conv?.id ?? "", 5);
    expect(messages[0]?.content).toContain("[Nota de voz transcrita] quiero cotizar unas balatas");
    expect(calls.some((c) => c.url.endsWith("/555/messages"))).toBe(true);
  });

  it("sin Workers AI avisa con honestidad que no puede abrir el audio", async () => {
    const calls = mockFetch();
    const { request } = setup();
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [{ value: { messages: [{ from: "521", type: "audio", audio: { id: "m" } }] } }],
        },
      ],
    };
    await request("/webhooks/meta", await signedMeta(body));
    const send = calls.find((c) => c.url.endsWith("/555/messages"));
    expect(JSON.parse(send?.body ?? "{}").text.body).toContain("no puedo abrir");
  });

  it("manda botones interactivos y respeta la ventana de 24 h", async () => {
    const calls = mockFetch();
    const sender = new WhatsAppCloudSender("t", "555");
    const now = Date.now();
    await sender.send(
      "521",
      { text: "¿Confirmo tu cita?", buttons: ["Sí", "No"] },
      { lastCustomerMessageAt: now, now },
    );
    const interactive = JSON.parse(calls[0]?.body ?? "{}");
    expect(
      interactive.interactive.action.buttons.map(
        (b: { reply: { title: string } }) => b.reply.title,
      ),
    ).toEqual(["Sí", "No"]);

    const old = { lastCustomerMessageAt: now - 25 * 3600_000, now };
    await expect(sender.send("521", { text: "hola" }, old)).rejects.toBeInstanceOf(
      OutsideWindowError,
    );
    await sender.send(
      "521",
      { text: "", template: { name: "recordatorio_cita", language: "es_MX", params: ["Ana"] } },
      old,
    );
    expect(JSON.parse(calls.at(-1)?.body ?? "{}")).toMatchObject({
      type: "template",
      template: { name: "recordatorio_cita" },
    });
  });
});

describe("Messenger e Instagram", () => {
  it("responde por /me/messages con respuestas rápidas", async () => {
    const calls = mockFetch();
    const { request } = setup();
    const body = {
      object: "instagram",
      entry: [{ messaging: [{ sender: { id: "ig-77" }, message: { text: "hola" } }] }],
    };
    await request("/webhooks/meta", await signedMeta(body));
    const send = calls.find((c) => c.url.includes("/me/messages"));
    expect(JSON.parse(send?.body ?? "{}")).toMatchObject({
      recipient: { id: "ig-77" },
      messaging_type: "RESPONSE",
    });
  });

  it("si una persona contesta desde la bandeja de Meta, el bot se aparta", async () => {
    mockFetch();
    const { request, store } = setup();
    const echo = {
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "page" },
              recipient: { id: "psid-9" },
              message: { is_echo: true, app_id: 999, text: "Hola, soy Santi" },
            },
          ],
        },
      ],
    };
    await request("/webhooks/meta", await signedMeta(echo));
    const [conv] = await store.listConversations("all", 5);
    expect(conv?.pausedUntil).toBeGreaterThan(Date.now());
    expect((await store.listMessages(conv?.id ?? "", 5))[0]).toMatchObject({
      role: "human",
      content: "Hola, soy Santi",
    });

    // el eco de nuestra propia app no pausa a nadie
    const own = {
      object: "page",
      entry: [
        {
          messaging: [
            { recipient: { id: "psid-10" }, message: { is_echo: true, app_id: 111, text: "bot" } },
          ],
        },
      ],
    };
    await request("/webhooks/meta", await signedMeta(own));
    expect(await store.findContact("messenger", "psid-10")).toBeNull();
  });
});

describe("WhatsApp vía Twilio", () => {
  const twilioEnv = {
    WHATSAPP_TOKEN: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
    TWILIO_ACCOUNT_SID: "AC1",
    TWILIO_AUTH_TOKEN: "twilio-secreto",
    TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
    PUBLIC_URL: "https://bot.example",
  };

  it("valida la firma y contesta por la API de Twilio", async () => {
    const calls = mockFetch();
    const { request } = setup(twilioEnv);
    const params = {
      From: "whatsapp:+5215512345678",
      Body: "hola",
      ProfileName: "Ana",
      NumMedia: "0",
    };
    const sig = await hmac(
      "SHA-1",
      "twilio-secreto",
      `https://bot.example/webhooks/twilio${Object.keys(params)
        .sort()
        .map((k) => k + params[k as keyof typeof params])
        .join("")}`,
      "base64",
    );
    expect(
      await verifyTwilioSignature(
        "https://bot.example/webhooks/twilio",
        params,
        sig,
        "twilio-secreto",
      ),
    ).toBe(true);

    const res = await request("/webhooks/twilio", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig },
      body: new URLSearchParams(params).toString(),
    });
    expect(res.status).toBe(200);
    const send = calls.find((c) => c.url.includes("api.twilio.com"));
    const form = new URLSearchParams(send?.body);
    expect(form.get("To")).toBe("whatsapp:+5215512345678");
    expect(form.get("From")).toBe("whatsapp:+14155238886");

    const forged = await request("/webhooks/twilio", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "falsa",
      },
      body: new URLSearchParams(params).toString(),
    });
    expect(forged.status).toBe(401);
  });

  it("los botones van como lista numerada", async () => {
    const calls = mockFetch();
    const sender = new TwilioWhatsAppSender("AC1", "t", "whatsapp:+1");
    const now = Date.now();
    await sender.send(
      "521",
      { text: "Elige:", buttons: ["Lunes", "Martes"] },
      { lastCustomerMessageAt: now, now },
    );
    expect(new URLSearchParams(calls[0]?.body).get("Body")).toBe("Elige:\n\n1. Lunes\n2. Martes");
  });
});

describe("Telegram multimedia", () => {
  it("transcribe notas de voz descargadas con getFile", async () => {
    const calls = mockFetch([
      [/getFile/, () => Response.json({ ok: true, result: { file_path: "voice/1.oga" } })],
      [/\/file\/bot/, () => new Response(new Uint8Array([9, 9]))],
    ]);
    const ai = { run: vi.fn(async () => ({ text: "¿tienen envíos?" })) };
    const { request, store } = setup({
      AI: ai as unknown as Ai,
      TELEGRAM_BOT_TOKEN: "tg",
      TELEGRAM_WEBHOOK_SECRET: "s",
    });
    await request("/webhooks/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "s" },
      body: JSON.stringify({
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 42, type: "private" },
          from: { id: 42, first_name: "Ana" },
          voice: { file_id: "f1" },
        },
      }),
    });
    const [conv] = await store.listConversations("all", 5);
    expect((await store.listMessages(conv?.id ?? "", 5))[0]?.content).toContain("¿tienen envíos?");
    expect(calls.some((c) => c.url.includes("/sendMessage"))).toBe(true);
  });
});

describe("panel · conexiones y respuesta humana por canal", () => {
  it("lista el estado de cada canal sin exponer secretos y entrega la respuesta por WhatsApp", async () => {
    const calls = mockFetch();
    const { request } = setup({ TELEGRAM_BOT_TOKEN: undefined });
    await request("/webhooks/meta", await signedMeta(whatsappText("hola")));

    const login = await request("/admin/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "clave" }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] as string;

    const status = (await (
      await request("/admin/api/connections", { headers: { cookie } })
    ).json()) as {
      channels: Array<{
        channel: string;
        configured: boolean;
        missing: string[];
        lastInboundAt: number | null;
      }>;
    };
    const wa = status.channels.find((ch) => ch.channel === "whatsapp");
    expect(wa).toMatchObject({ configured: true });
    expect(wa?.lastInboundAt).toBeGreaterThan(0);
    expect(status.channels.find((ch) => ch.channel === "telegram")?.missing).toContain(
      "TELEGRAM_BOT_TOKEN",
    );
    expect(JSON.stringify(status)).not.toContain("wa-token");

    const list = (await (
      await request("/admin/api/conversations", { headers: { cookie } })
    ).json()) as {
      conversations: Array<{ id: string }>;
    };
    const reply = await request(`/admin/api/conversations/${list.conversations[0]?.id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ text: "Hola, te atiendo yo" }),
    });
    expect(((await reply.json()) as { delivered: boolean }).delivered).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/555/messages")).at(-1)?.body).toContain(
      "Hola, te atiendo yo",
    );
  });
});
