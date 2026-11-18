import { systemLocale } from "@yunque/core";
import { z } from "zod";
import type { MediaAttachment } from "../channels/types.js";
import type { Toolkit, ToolkitContext } from "../engine/engine.js";
import type { Env } from "../env.js";
import { memberToolkit } from "../member/tools.js";
import type { Store } from "../store/types.js";
import { CalcomClient, StripeClient } from "./providers.js";
import type { IntegrationsStore } from "./store.js";

export interface ToolkitDeps {
  env: Env;
  store: Store;
  integrations: IntegrationsStore;
}

function localDateTime(iso: string, timeZone: string, language: string): string {
  try {
    return new Intl.DateTimeFormat(systemLocale(language as never), {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------- Agenda (Cal.com) ----------

const availabilityInput = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1).max(7).optional(),
});
const bookingInput = z.object({
  inicio: z.string().min(10).max(40),
  nombre: z.string().trim().min(1).max(120),
  correo: z.string().trim().email().max(200),
  telefono: z.string().trim().max(40).optional(),
});

function bookingToolkit(deps: ToolkitDeps, ctx: ToolkitContext): Toolkit | null {
  const { booking } = ctx.settings;
  if (!booking.enabled || !booking.eventTypeId || !deps.env.CALCOM_API_KEY) return null;
  const eventTypeId = booking.eventTypeId;
  const calcom = new CalcomClient(deps.env.CALCOM_API_KEY);
  const { timezone, language } = ctx.profile;
  const lang = systemLocale(language).slice(0, 2);

  return {
    multiStepFlow: true,
    promptSection: {
      title: "Agenda",
      text: "Puedes consultar horarios libres con ver_disponibilidad y reservar con agendar_cita. Pide los datos de a uno: día, horario (de los que devolvió la herramienta), nombre y correo. Solo confirma una cita cuando agendar_cita responda que quedó reservada.",
    },
    tools: [
      {
        name: "ver_disponibilidad",
        description:
          "Consulta los horarios libres para agendar a partir de una fecha (YYYY-MM-DD).",
        inputSchema: {
          type: "object",
          properties: {
            fecha: { type: "string", description: "Primer día a consultar, formato YYYY-MM-DD" },
            dias: { type: "integer", description: "Cuántos días revisar desde esa fecha (1 a 7)" },
          },
          required: ["fecha"],
        },
      },
      {
        name: "agendar_cita",
        description: "Reserva la cita en un horario devuelto por ver_disponibilidad.",
        inputSchema: {
          type: "object",
          properties: {
            inicio: {
              type: "string",
              description: "Valor exacto de 'inicio' devuelto por ver_disponibilidad",
            },
            nombre: { type: "string" },
            correo: { type: "string" },
            telefono: { type: "string" },
          },
          required: ["inicio", "nombre", "correo"],
        },
      },
    ],
    handlers: {
      ver_disponibilidad: async (raw) => {
        const input = availabilityInput.safeParse(raw);
        if (!input.success) return { content: "Indica la fecha como YYYY-MM-DD.", isError: true };
        const start = Date.parse(`${input.data.fecha}T00:00:00Z`);
        const end = isoDate(start + ((input.data.dias ?? 3) - 1) * 86_400_000);
        const slots = await calcom.slots(eventTypeId, input.data.fecha, end, timezone);
        const lines = Object.entries(slots)
          .flatMap(([, list]) => list.map((s) => s.start))
          .slice(0, 12)
          .map((iso) => `- ${localDateTime(iso, timezone, language)} → inicio: ${iso}`);
        return {
          content: lines.length
            ? `Horarios libres:\n${lines.join("\n")}`
            : "No hay horarios libres en esas fechas.",
        };
      },
      agendar_cita: async (raw) => {
        const input = bookingInput.safeParse(raw);
        if (!input.success)
          return { content: "Faltan datos: horario, nombre y un correo válido.", isError: true };
        const booked = await calcom.book({
          eventTypeId,
          start: input.data.inicio,
          name: input.data.nombre,
          email: input.data.correo,
          ...(input.data.telefono ? { phone: input.data.telefono } : {}),
          timeZone: timezone,
          language: lang,
        });
        await deps.integrations.saveAppointment({
          conversationId: ctx.conversation.id,
          contactId: ctx.contact.id,
          provider: "calcom",
          externalId: booked.uid,
          startAt: Date.parse(booked.start),
          attendeeName: input.data.nombre,
        });
        await deps.store.upsertLead({
          contactId: ctx.contact.id,
          conversationId: ctx.conversation.id,
          name: input.data.nombre,
          email: input.data.correo,
          ...(input.data.telefono ? { phone: input.data.telefono } : {}),
          interest: `Cita: ${localDateTime(booked.start, timezone, language)}`,
        });
        return {
          content: `Cita reservada para ${localDateTime(booked.start, timezone, language)} (código ${booked.uid}). Confírmasela al cliente.`,
        };
      },
    },
  };
}

// ---------- Cobros (Stripe) ----------

const paymentInput = z.object({
  concepto: z.string().trim().min(1).max(200),
  monto: z.number().positive(),
});

function paymentsToolkit(deps: ToolkitDeps, ctx: ToolkitContext): Toolkit | null {
  const { payments } = ctx.settings;
  if (!payments.enabled || !deps.env.STRIPE_SECRET_KEY) return null;
  const stripe = new StripeClient(deps.env.STRIPE_SECRET_KEY);
  const base = deps.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";

  return {
    promptSection: {
      title: "Cobros",
      text: `Cuando el cliente confirme una compra cuyo precio está en la información del negocio, genera el link con crear_link_de_pago (moneda ${payments.currency.toUpperCase()}) y compártelo tal cual. Nunca inventes ni redondees montos.`,
    },
    tools: [
      {
        name: "crear_link_de_pago",
        description:
          "Crea un link de pago seguro (Stripe) por un monto y concepto confirmados con el cliente.",
        inputSchema: {
          type: "object",
          properties: {
            concepto: { type: "string", description: "Qué se cobra, como lo verá el cliente" },
            monto: { type: "number", description: "Monto total en la moneda del negocio" },
          },
          required: ["concepto", "monto"],
        },
      },
    ],
    handlers: {
      crear_link_de_pago: async (raw) => {
        const input = paymentInput.safeParse(raw);
        if (!input.success) return { content: "Indica concepto y monto positivo.", isError: true };
        if (payments.maxAmount !== null && input.data.monto > payments.maxAmount) {
          return {
            content: "Ese monto supera el tope configurado; pásale la conversación al equipo.",
            isError: true,
          };
        }
        const session = await stripe.createCheckout({
          concept: input.data.concepto,
          amount: input.data.monto,
          currency: payments.currency,
          successUrl: `${base}/pago/ok`,
          cancelUrl: `${base}/pago/cancelado`,
          metadata: { conversation_id: ctx.conversation.id, contact_id: ctx.contact.id },
        });
        await deps.integrations.savePayment({
          conversationId: ctx.conversation.id,
          contactId: ctx.contact.id,
          sessionId: session.id,
          concept: input.data.concepto,
          amount: input.data.monto,
          currency: payments.currency,
          url: session.url,
        });
        return {
          content: `Link de pago listo: ${session.url}\nCompártelo tal cual; te aviso cuando se confirme el pago.`,
        };
      },
    },
  };
}

// ---------- Galería ----------

async function galleryToolkit(deps: ToolkitDeps): Promise<Toolkit | null> {
  const items = await deps.integrations.listGallery();
  if (items.length === 0) return null;
  const base = deps.env.PUBLIC_URL?.replace(/\/$/, "") ?? "";
  const attachments: MediaAttachment[] = [];
  const nameInput = z.object({ nombre: z.string().trim().min(1).max(120) });

  return {
    attachments,
    promptSection: {
      title: "Galería",
      text: `Puedes mandar archivos reales del negocio con enviar_archivo cuando vengan al caso (no pegues links):\n${items
        .map((i) => `- «${i.name}» (${i.kind}): ${i.description}`)
        .join("\n")}`,
    },
    tools: [
      {
        name: "enviar_archivo",
        description: "Envía al cliente un archivo de la Galería del negocio por su nombre exacto.",
        inputSchema: {
          type: "object",
          properties: { nombre: { type: "string" } },
          required: ["nombre"],
        },
      },
    ],
    handlers: {
      enviar_archivo: async (raw) => {
        const input = nameInput.safeParse(raw);
        if (!input.success) return { content: "Indica el nombre del archivo.", isError: true };
        const wanted = input.data.nombre.toLowerCase();
        const item =
          items.find((i) => i.name.toLowerCase() === wanted) ??
          items.find((i) => i.name.toLowerCase().includes(wanted));
        if (!item)
          return { content: `No existe «${input.data.nombre}» en la Galería.`, isError: true };
        if (!attachments.some((a) => a.url.endsWith(item.objectKey))) {
          attachments.push({ kind: item.kind, url: `${base}/media/${item.objectKey}` });
        }
        return { content: `«${item.name}» se enviará junto a tu mensaje. No pegues el link.` };
      },
    },
  };
}

/** Kits de herramientas activos para este turno según la configuración y los secretos. */
export function createToolkits(deps: ToolkitDeps) {
  return async (ctx: ToolkitContext): Promise<Toolkit[]> => {
    const kits = [
      bookingToolkit(deps, ctx),
      paymentsToolkit(deps, ctx),
      await galleryToolkit(deps),
      memberToolkit(ctx),
    ];
    return kits.filter((k): k is Toolkit => k !== null);
  };
}
