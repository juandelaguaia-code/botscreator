import { defaultBotSettings } from "@yunque/core";
import { FakeProvider, type LlmPart } from "@yunque/llm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { runAutomation } from "../src/automation/runner.js";
import type { ChannelSender } from "../src/channels/types.js";
import { SETTINGS_KEYS } from "../src/engine/config.js";
import { ConversationEngine } from "../src/engine/engine.js";
import type { Env } from "../src/env.js";
import { toStripeAmount, verifyStripeSignature } from "../src/integrations/providers.js";
import { createToolkits } from "../src/integrations/toolkits.js";
import { hmac } from "../src/lib/crypto.js";
import { createServices, type Services } from "../src/services.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

/** R2 en memoria con la parte de la API que usa el bot. */
class MemoryR2 {
  readonly objects = new Map<string, { data: ArrayBuffer; type: string }>();
  async put(key: string, data: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, {
      data,
      type: opts?.httpMetadata?.contentType ?? "application/octet-stream",
    });
  }
  async get(key: string) {
    const o = this.objects.get(key);
    return o ? { body: new Blob([o.data]).stream(), httpMetadata: { contentType: o.type } } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

const say = (text: string): LlmPart[] => [{ type: "text", text }];
const call = (id: string, name: string, input: Record<string, unknown>): LlmPart[] => [
  { type: "tool_call", id, name, input },
];

async function setup(settings: Record<string, unknown> = {}, extraEnv: Partial<Env> = {}) {
  const media = new MemoryR2();
  const env = {
    DB: createTestD1(),
    MEDIA: media as unknown as R2Bucket,
    LLM_PROVIDER: "fake",
    BOT_NAME: "Spa Luna",
    DASHBOARD_PASSWORD: "clave",
    PUBLIC_URL: "https://spa.example",
    ...extraEnv,
  } as Env;
  const services = createServices(env);
  await services.store.setSetting(SETTINGS_KEYS.settings, {
    ...defaultBotSettings(),
    provider: "fake",
    verifierEnabled: false,
    ...settings,
  });
  await services.store.setSetting(SETTINGS_KEYS.profile, {
    name: "Spa Luna",
    timezone: "America/Santiago",
    currency: "$",
  });
  const engineWith = (script: ConstructorParameters<typeof FakeProvider>[0]) => {
    const provider = new FakeProvider(script);
    const engine = new ConversationEngine({
      store: services.store,
      automation: services.automation,
      toolkits: createToolkits({ env, store: services.store, integrations: services.integrations }),
      providerFor: () => provider,
      loadConfig: services.config,
      log: () => {},
    });
    return { engine, provider };
  };
  return { env, services, media, engineWith };
}

function mockFetch(routes: Array<[RegExp, (init?: RequestInit) => Response]>) {
  const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body =
        init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body ?? "");
      calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
      for (const [pattern, respond] of routes) if (pattern.test(url)) return respond(init);
      return new Response("no encontrado", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Agenda con Cal.com", () => {
  it("consulta horarios, reserva, guarda la cita y el lead, y usa el modelo inteligente", async () => {
    const calls = mockFetch([
      [
        /api\.cal\.com\/v2\/slots/,
        () =>
          Response.json({
            status: "success",
            data: { "2026-11-20": [{ start: "2026-11-20T10:00:00.000-03:00" }] },
          }),
      ],
      [
        /api\.cal\.com\/v2\/bookings/,
        () =>
          Response.json({
            status: "success",
            data: { uid: "bk_1", start: "2026-11-20T13:00:00.000Z" },
          }),
      ],
    ]);
    const { services, engineWith } = await setup(
      { booking: { enabled: true, eventTypeId: 42 }, modelMode: "equilibrado" },
      { CALCOM_API_KEY: "cal_test" },
    );
    const { engine, provider } = engineWith((_req, i) =>
      i === 0
        ? call("t1", "ver_disponibilidad", { fecha: "2026-11-20" })
        : i === 1
          ? call("t2", "agendar_cita", {
              inicio: "2026-11-20T10:00:00.000-03:00",
              nombre: "Ana",
              correo: "ana@correo.com",
            })
          : say("¡Listo, Ana! Tu cita quedó para el jueves 20 a las 10:00."),
    );
    const r = await engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-cal",
      text: "quiero agendar",
    });
    expect(r.reply).toContain("Tu cita quedó");
    expect(provider.calls[0]?.tier).toBe("smart");
    expect(provider.calls[0]?.system.stable).toContain("ver_disponibilidad");

    const slots = calls.find((c) => c.url.includes("/slots"));
    expect(slots?.url).toContain("eventTypeId=42");
    expect(slots?.headers["cal-api-version"]).toBe("2024-09-04");
    expect(JSON.parse(calls.find((c) => c.url.includes("/bookings"))?.body ?? "{}")).toMatchObject({
      eventTypeId: 42,
      attendee: { name: "Ana", email: "ana@correo.com", timeZone: "America/Santiago" },
    });
    const [apt] = await services.integrations.listAppointments(0);
    expect(apt).toMatchObject({ attendeeName: "Ana", status: "confirmed" });
    expect((await services.store.listLeads(5))[0]).toMatchObject({ email: "ana@correo.com" });
  });

  it("sin llave de Cal.com no ofrece las herramientas de agenda", async () => {
    const { engineWith } = await setup({ booking: { enabled: true, eventTypeId: 42 } });
    const { engine, provider } = engineWith(() => say("hola"));
    await engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-cal2",
      text: "hola",
    });
    expect(provider.calls[0]?.tools?.map((t) => t.name)).not.toContain("agendar_cita");
  });

  it("recuerda la cita unas 24 h antes, una sola vez", async () => {
    const { services, env } = await setup();
    const sent: string[] = [];
    const telegram: ChannelSender = {
      channel: "telegram",
      send: vi.fn(async (_to, m) => void sent.push(m.text)),
    };
    const svc: Services = { ...services, senders: { telegram } };
    const contact = await services.store.upsertContact({ channel: "telegram", externalId: "77" });
    const conv = await services.store.createConversation({
      contactId: contact.id,
      channel: "telegram",
    });
    await services.integrations.saveAppointment({
      conversationId: conv.id,
      contactId: contact.id,
      provider: "calcom",
      externalId: "bk_9",
      startAt: Date.now() + 23 * 3_600_000,
      attendeeName: "Ana",
    });
    expect(env.DB).toBeDefined();
    expect((await runAutomation(svc)).reminders).toBe(1);
    expect(sent[0]).toContain("Te recuerdo tu cita en Spa Luna");
    expect((await runAutomation(svc)).reminders).toBe(0);
  });
});

describe("Cobros con Stripe", () => {
  it("convierte montos según la moneda (CLP sin decimales)", () => {
    expect(toStripeAmount(15990, "clp")).toBe(15990);
    expect(toStripeAmount(19.9, "usd")).toBe(1990);
  });

  it("crea el link de pago con el monto y respeta el tope", async () => {
    const calls = mockFetch([
      [
        /api\.stripe\.com\/v1\/checkout\/sessions/,
        () => Response.json({ id: "cs_test_1", url: "https://checkout.stripe.com/c/cs_test_1" }),
      ],
    ]);
    const { services, engineWith } = await setup(
      { payments: { enabled: true, currency: "clp", maxAmount: 100_000 } },
      { STRIPE_SECRET_KEY: "sk_test_x" },
    );
    const { engine } = engineWith((_req, i) =>
      i === 0
        ? call("p1", "crear_link_de_pago", { concepto: "Masaje relajante", monto: 25_000 })
        : say("Aquí tienes tu link: https://checkout.stripe.com/c/cs_test_1"),
    );
    await engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-pay",
      text: "quiero pagar el masaje",
    });
    const form = new URLSearchParams(calls[0]?.body);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("25000");
    expect(form.get("line_items[0][price_data][currency]")).toBe("clp");
    expect(form.get("success_url")).toBe("https://spa.example/pago/ok");
    expect((await services.integrations.listPayments())[0]).toMatchObject({
      amount: 25_000,
      status: "pending",
    });

    const over = engineWith((_req, i) =>
      i === 0
        ? call("p2", "crear_link_de_pago", { concepto: "Paquete", monto: 500_000 })
        : say("Te paso con el equipo."),
    );
    await over.engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-pay2",
      text: "quiero pagar",
    });
    expect(calls).toHaveLength(1);
  });

  it("el webhook firmado marca pagado, gana el lead y no se procesa dos veces", async () => {
    mockFetch([]);
    const { env, services } = await setup({}, { STRIPE_WEBHOOK_SECRET: "whsec_test" });
    const contact = await services.store.upsertContact({
      channel: "web",
      externalId: "web_visitante-w",
    });
    const conv = await services.store.createConversation({ contactId: contact.id, channel: "web" });
    await services.store.upsertLead({
      contactId: contact.id,
      conversationId: conv.id,
      name: "Ana",
    });
    await services.integrations.savePayment({
      conversationId: conv.id,
      contactId: contact.id,
      sessionId: "cs_paid",
      concept: "Masaje",
      amount: 25_000,
      currency: "clp",
      url: "https://checkout.stripe.com/c/cs_paid",
    });

    const app = createApp();
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext;
    const event = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { id: "cs_paid", payment_status: "paid" } },
    });
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${await hmac("SHA-256", "whsec_test", `${t}.${event}`, "hex")}`;
    const post = async (sig: string) => {
      const res = await app.request(
        "/webhooks/stripe",
        { method: "POST", headers: { "stripe-signature": sig }, body: event },
        env,
        ctx,
      );
      await Promise.all(pending.splice(0));
      return res;
    };

    expect((await post("t=1,v1=falsa")).status).toBe(400);
    expect((await post(signature)).status).toBe(200);
    expect((await services.integrations.listPayments())[0]?.status).toBe("paid");
    expect((await services.store.listLeads(5))[0]?.status).toBe("ganado");
    const msgs = await services.store.listMessages(conv.id, 5);
    expect(msgs.at(-1)?.content).toContain("Recibimos tu pago");

    await post(signature); // reintento de Stripe
    expect(
      (await services.store.listMessages(conv.id, 10)).filter((m) =>
        m.content.includes("Recibimos"),
      ),
    ).toHaveLength(1);
  });

  it("rechaza firmas viejas", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const sig = `t=${old},v1=${await hmac("SHA-256", "s", `${old}.{}`, "hex")}`;
    expect(await verifyStripeSignature("{}", sig, "s")).toBe(false);
  });
});

describe("Galería", () => {
  it("sube un archivo, el bot lo manda y se sirve público", async () => {
    const { env, services, media, engineWith } = await setup();
    const app = createApp();
    const login = await app.request(
      "/admin/api/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "clave" }),
      },
      env,
    );
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] as string;

    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "menu.png", { type: "image/png" }),
    );
    form.set("name", "Menú");
    form.set("description", "Cuando pidan ver el menú o los precios");
    const up = await app.request(
      "/admin/api/gallery",
      { method: "POST", headers: { cookie }, body: form },
      env,
    );
    expect(up.status).toBe(201);
    const { item } = (await up.json()) as { item: { id: string; url: string } };
    expect(item.url).toMatch(/^https:\/\/spa\.example\/media\/g_/);
    expect(media.objects.size).toBe(1);

    const { engine, provider } = engineWith((_req, i) =>
      i === 0 ? call("g1", "enviar_archivo", { nombre: "menú" }) : say("¡Aquí está nuestro menú!"),
    );
    const r = await engine.handleInbound({
      channel: "web",
      externalUserId: "web_visitante-gal",
      text: "¿me mandas el menú?",
    });
    expect(r.attachments).toEqual([{ kind: "image", url: item.url }]);
    expect(provider.calls[0]?.system.stable).toContain("«Menú»");

    const served = await app.request(new URL(item.url).pathname, {}, env);
    expect(served.headers.get("content-type")).toBe("image/png");

    expect(
      (
        await app.request(
          `/admin/api/gallery/${item.id}`,
          { method: "DELETE", headers: { cookie } },
          env,
        )
      ).status,
    ).toBe(200);
    expect(media.objects.size).toBe(0);
    expect(await services.integrations.listGallery()).toHaveLength(0);
  });
});

describe("Campañas", () => {
  it("envía por lotes, personaliza el nombre y respeta la ventana de WhatsApp", async () => {
    const { services } = await setup();
    const sent: Array<{ channel: string; text: string }> = [];
    const sender = (channel: "telegram" | "whatsapp"): ChannelSender => ({
      channel,
      send: vi.fn(async (_to, m) => void sent.push({ channel, text: m.text })),
    });
    const svc: Services = {
      ...services,
      senders: { telegram: sender("telegram"), whatsapp: sender("whatsapp") },
    };

    for (const [channel, id, name] of [
      ["telegram", "t1", "Ana"],
      ["telegram", "t2", "Luis"],
      ["whatsapp", "w1", "Eva"],
    ] as const) {
      const c = await services.store.upsertContact({ channel, externalId: id, name });
      const conv = await services.store.createConversation({ contactId: c.id, channel });
      await services.store.updateConversation(conv.id, {
        lastCustomerMessageAt: Date.now() - 3 * 86_400_000,
      });
    }
    const id = await services.integrations.createCampaign({
      name: "Promo diciembre",
      message: "Hola {nombre}, este mes tenemos 2x1 en masajes.",
      segment: { statuses: [], channels: ["telegram", "whatsapp"] },
    });
    await services.integrations.setCampaignStatus(id, "sending");
    const report = await runAutomation(svc);
    expect(report.campaignSent).toBe(2);
    expect(sent.map((s) => s.text).sort()).toEqual([
      "Hola Ana, este mes tenemos 2x1 en masajes.",
      "Hola Luis, este mes tenemos 2x1 en masajes.",
    ]);
    await runAutomation(svc);
    const [campaign] = await services.integrations.listCampaigns();
    expect(campaign).toMatchObject({ status: "done", sent: 2, skipped: 1, recipients: 3 });
  });
});
