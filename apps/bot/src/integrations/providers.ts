import { hmac, timingSafeEqual } from "../lib/crypto.js";

// ---------- Cal.com (API v2) ----------

const CALCOM = "https://api.cal.com/v2";

export interface CalcomSlot {
  /** Inicio en ISO 8601 (con zona horaria), tal como lo acepta la reserva. */
  start: string;
}

export class CalcomClient {
  constructor(private readonly apiKey: string) {}

  private async call<T>(path: string, version: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${CALCOM}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "cal-api-version": version,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      data?: T;
      error?: { message?: string };
    };
    if (!res.ok || body.status === "error") {
      throw new Error(`Cal.com respondió ${res.status}: ${body.error?.message ?? "error"}`);
    }
    return body.data as T;
  }

  /** Horarios libres por día entre dos fechas (YYYY-MM-DD), en la zona horaria del negocio. */
  async slots(
    eventTypeId: number,
    start: string,
    end: string,
    timeZone: string,
  ): Promise<Record<string, CalcomSlot[]>> {
    const query = new URLSearchParams({ eventTypeId: String(eventTypeId), start, end, timeZone });
    return this.call<Record<string, CalcomSlot[]>>(`/slots?${query}`, "2024-09-04");
  }

  async book(input: {
    eventTypeId: number;
    start: string;
    name: string;
    email: string;
    phone?: string;
    timeZone: string;
    language: string;
  }): Promise<{ uid: string; start: string }> {
    return this.call<{ uid: string; start: string }>("/bookings", "2024-08-13", {
      method: "POST",
      body: JSON.stringify({
        start: new Date(input.start).toISOString(),
        eventTypeId: input.eventTypeId,
        attendee: {
          name: input.name,
          email: input.email,
          timeZone: input.timeZone,
          language: input.language,
          ...(input.phone ? { phoneNumber: input.phone } : {}),
        },
      }),
    });
  }
}

// ---------- Stripe ----------

/** Monedas que Stripe cobra sin decimales (el monto va tal cual, no en centavos). */
const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function toStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export class StripeClient {
  constructor(private readonly secretKey: string) {}

  /** Checkout Session de pago único: devuelve el link para mandarle al cliente. */
  async createCheckout(input: {
    concept: string;
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }> {
    const form = new URLSearchParams({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(
        toStripeAmount(input.amount, input.currency),
      ),
      "line_items[0][price_data][product_data][name]": input.concept.slice(0, 200),
    });
    for (const [k, v] of Object.entries(input.metadata)) form.set(`metadata[${k}]`, v);
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!res.ok || !body.id || !body.url)
      throw new Error(`Stripe respondió ${res.status}: ${body.error?.message ?? "error"}`);
    return { id: body.id, url: body.url };
  }
}

/**
 * Firma de webhooks de Stripe: `Stripe-Signature: t=<ts>,v1=<hex>`, HMAC-SHA256 de `${t}.${cuerpo}`.
 * Rechaza firmas viejas (5 min) para evitar reenvíos.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = Number(parts.t);
  if (!parts.t || !parts.v1 || !Number.isFinite(t) || Math.abs(nowSeconds - t) > 300) return false;
  const expected = await hmac("SHA-256", secret, `${parts.t}.${rawBody}`, "hex");
  return timingSafeEqual(parts.v1, expected);
}
