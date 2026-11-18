/**
 * Botones tocables (opt-in). El modelo marca las opciones al final de su respuesta con
 * `[[opciones: A | B | C]]`; aquí se separan del texto para que cada canal las dibuje a su modo
 * (botones nativos o lista numerada).
 */

export const MAX_BUTTONS = 3;
export const MAX_BUTTON_LENGTH = 24;

const MARKER = /\[\[\s*(?:opciones|options|op[cç][oõ]es)\s*:\s*([^\]]*?)\s*\]\]/gi;

export function extractButtons(text: string): { text: string; buttons: string[] } {
  const buttons: string[] = [];
  const cleaned = text.replace(MARKER, (_match, list: string) => {
    for (const raw of list.split("|")) {
      const label = raw.trim().replace(/^["'«]|["'»]$/g, "");
      if (label && !buttons.includes(label)) buttons.push(label.slice(0, MAX_BUTTON_LENGTH));
    }
    return "";
  });
  return {
    text: cleaned
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    buttons: buttons.slice(0, MAX_BUTTONS),
  };
}

/** Para canales sin botones nativos: las opciones como lista numerada. */
export function buttonsAsText(text: string, buttons: string[]): string {
  if (buttons.length === 0) return text;
  return `${text}\n\n${buttons.map((b, i) => `${i + 1}. ${b}`).join("\n")}`;
}

export const BUTTONS_INSTRUCTION = `## Botones
Cuando le ofrezcas al cliente una elección cerrada de dos o tres opciones (confirmar una cita, elegir un servicio, sí/no), agrega al final de tu mensaje una línea exactamente así: [[opciones: Opción 1 | Opción 2 | Opción 3]]. Máximo tres opciones, de pocas palabras cada una. No la uses en preguntas abiertas.`;
