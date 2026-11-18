import type { BusinessProfile } from "../business.js";
import { BUTTONS_INSTRUCTION } from "../buttons.js";
import { languageInstruction } from "../i18n.js";
import { channelFormatSection, guardrailsSection } from "./guardrails.js";
import { VOICE_PRESETS } from "./voice.js";

export type PromptSectionId =
  | "guardrails"
  | "channel"
  | "business"
  | "voice"
  | "instructions"
  | "buttons"
  | "integration"
  | "language";

export interface PromptSection {
  id: PromptSectionId;
  title: string;
  /** Bloqueada: la arma el sistema y el dueño no la puede editar. */
  locked: boolean;
  text: string;
}

export interface BuiltPrompt {
  sections: PromptSection[];
  /** Parte estable del sistema (cacheable): solo cambia cuando el dueño edita su configuración. */
  stable: string;
  /** Parte volátil (fecha y hora): va después del bloque cacheado. */
  volatile: string;
}

export interface KnowledgePassage {
  title: string;
  text: string;
  /** Relevancia 0–1 frente a la pregunta del cliente. */
  score: number;
}

export interface BuildPromptInput {
  profile: BusinessProfile;
  channel: string;
  now: Date;
  /** El bot tiene base de conocimiento cargada. */
  knowledgeBase?: boolean;
  /** Pasajes relevantes para este turno (ya filtrados por el umbral de confianza). */
  passages?: KnowledgePassage[];
  /** Botones tocables activados. */
  buttons?: boolean;
  /** Memoria del cliente de conversaciones anteriores (la deja el Vigilante). */
  customerMemory?: string | null;
  /** Secciones de integraciones activas (agenda, cobros, galería), bloqueadas para el dueño. */
  extraSections?: Array<{ title: string; text: string }>;
}

export function renderPassages(passages: KnowledgePassage[]): string {
  return passages
    .map((p, i) => `[${i + 1}] (${p.title}, relevancia ${p.score.toFixed(2)})\n${p.text}`)
    .join("\n\n");
}

export function renderBusinessInfo(p: BusinessProfile): string {
  const lines: string[] = [`Nombre: ${p.name}`];
  if (p.description) lines.push(`A qué se dedica: ${p.description}`);

  if (p.offerings.length > 0) {
    lines.push("Productos y servicios:");
    for (const o of p.offerings) {
      const parts = [o.name];
      if (o.price) parts.push(formatPrice(o.price, p.currency));
      if (o.durationMinutes) parts.push(`${o.durationMinutes} min`);
      if (o.bookable) parts.push("se puede agendar");
      const head = parts.join(" · ");
      lines.push(o.description ? `- ${head}: ${o.description}` : `- ${head}`);
    }
  }

  if (p.hours) lines.push(`Horario: ${p.hours} (zona horaria ${p.timezone})`);
  if (p.location) lines.push(`Ubicación: ${p.location}`);
  if (p.phone) lines.push(`Teléfono / WhatsApp: ${p.phone}`);
  if (p.website) lines.push(`Sitio web o redes: ${p.website}`);
  if (p.paymentMethods.length > 0) lines.push(`Métodos de pago: ${p.paymentMethods.join(", ")}`);
  if (p.promotion) lines.push(`Promoción vigente: ${p.promotion}`);

  if (p.faq.length > 0) {
    lines.push("Preguntas frecuentes:");
    for (const f of p.faq) lines.push(`- P: ${f.question}\n  R: ${f.answer}`);
  }
  return lines.join("\n");
}

function formatPrice(price: string, currency: string): string {
  return /^[\d.,\s]+$/.test(price) ? `${currency}${price.trim()}` : price;
}

export function formatNow(now: Date, timezone: string, locale = "es"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

/**
 * Arma el prompt de sistema por secciones. El orden importa: frenos primero (no se pueden
 * anular), datos del negocio después y las instrucciones del dueño al final de lo editable.
 */
export function buildSystemPrompt({
  profile,
  channel,
  now,
  knowledgeBase = false,
  passages = [],
  buttons = false,
  customerMemory = null,
  extraSections = [],
}: BuildPromptInput): BuiltPrompt {
  const sections: PromptSection[] = [
    {
      id: "guardrails",
      title: "Frenos de seguridad",
      locked: true,
      text: guardrailsSection(profile.name, { knowledgeBase }),
    },
    {
      id: "channel",
      title: "Formato del canal",
      locked: true,
      text: channelFormatSection(channel),
    },
    {
      id: "business",
      title: "Información del negocio",
      locked: false,
      text: `## Información del negocio (tu única fuente de verdad)\n${renderBusinessInfo(profile)}`,
    },
    {
      id: "voice",
      title: "Voz de marca",
      locked: false,
      text: `## Voz de marca\n${VOICE_PRESETS[profile.tone]}`,
    },
  ];

  if (profile.instructions) {
    sections.push({
      id: "instructions",
      title: "Instrucciones del dueño",
      locked: false,
      text: `## Instrucciones del dueño\n${profile.instructions}`,
    });
  }

  for (const extra of extraSections) {
    sections.push({
      id: "integration",
      title: extra.title,
      locked: true,
      text: `## ${extra.title}\n${extra.text}`,
    });
  }

  if (buttons) {
    sections.push({ id: "buttons", title: "Botones", locked: true, text: BUTTONS_INSTRUCTION });
  }

  sections.push({
    id: "language",
    title: "Idioma",
    locked: true,
    text: `## Idioma\n${languageInstruction(profile.language)}`,
  });

  const volatileParts = [`Fecha y hora actual del negocio: ${formatNow(now, profile.timezone)}.`];
  if (customerMemory) {
    volatileParts.push(
      `## Lo que sabemos de este cliente (conversaciones anteriores)\n${customerMemory}\nÚsalo con naturalidad; no le recites lo que sabes.`,
    );
  }
  if (knowledgeBase) {
    volatileParts.push(
      passages.length > 0
        ? `## Pasajes de la base de conocimiento para este mensaje\n${renderPassages(passages)}`
        : "## Pasajes de la base de conocimiento para este mensaje\nNinguno con relevancia suficiente. Si necesitas un dato, búscalo o confírmalo con el equipo.",
    );
  }

  return {
    sections,
    stable: sections.map((s) => s.text).join("\n\n"),
    volatile: volatileParts.join("\n\n"),
  };
}
