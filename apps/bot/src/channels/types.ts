import type { Channel } from "@yunque/core";

/** Archivo que el bot manda (Galería) o recibe. */
export interface MediaAttachment {
  kind: "image" | "video" | "audio" | "document";
  url: string;
  caption?: string;
}

/** Plantilla aprobada de WhatsApp (para escribir fuera de la ventana de 24 h). */
export interface WhatsAppTemplate {
  name: string;
  language: string;
  /** Variables del cuerpo, en orden ({{1}}, {{2}}…). */
  params?: string[];
}

export interface OutboundMessage {
  text: string;
  buttons?: string[];
  media?: MediaAttachment[];
  template?: WhatsAppTemplate;
}

export interface SendContext {
  /** Último mensaje del cliente: WhatsApp solo permite texto libre dentro de 24 h. */
  lastCustomerMessageAt: number | null;
  now: number;
}

/** Entrega mensajes salientes en un canal. */
export interface ChannelSender {
  readonly channel: Channel;
  send(externalUserId: string, message: OutboundMessage, context: SendContext): Promise<void>;
}

/** Medio recibido que se descarga solo si hace falta (transcribir o mirar). */
export interface MediaRef {
  kind: "audio" | "image" | "other";
  mimeType?: string;
  download: () => Promise<{ data: ArrayBuffer; mimeType: string }>;
}

/** Mensaje entrante ya normalizado, venga del canal que venga. */
export interface InboundEnvelope {
  channel: Channel;
  externalUserId: string;
  userName?: string;
  text: string;
  media?: MediaRef[];
  /** Lo escribió una persona del negocio desde la app del canal (no el bot): pausa al bot. */
  fromBusinessHuman?: boolean;
}

export class OutsideWindowError extends Error {
  constructor() {
    super("Fuera de la ventana de 24 h de WhatsApp: hace falta una plantilla aprobada.");
    this.name = "OutsideWindowError";
  }
}

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function insideWhatsAppWindow(context: SendContext): boolean {
  return (
    context.lastCustomerMessageAt !== null &&
    context.now - context.lastCustomerMessageAt < WHATSAPP_WINDOW_MS
  );
}
