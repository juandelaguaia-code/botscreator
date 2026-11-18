import type { ModelMode, ModelTier } from "./settings.js";

export interface RoutingSignals {
  /** Texto del último mensaje del cliente. */
  text: string;
  /** El bot tiene activos flujos de varios pasos (agendar, pedidos, reservas). */
  multiStepFlow: boolean;
  /** El mensaje trae imagen (la visión rinde mejor en el modelo inteligente). */
  hasImage: boolean;
  /** Cuántos mensajes del cliente lleva la conversación. */
  customerTurns: number;
}

const COMPLEX_HINTS =
  /\b(cotiz|presupuesto|comparar|diferencia|reclamo|queja|problema|factura|reembolso|devoluci|garant|quote|refund|complain|invoice|orcamento|reclama)/i;

/** Elige el nivel de modelo para este turno. */
export function chooseModelTier(mode: ModelMode, s: RoutingSignals): ModelTier {
  if (mode === "economico") return "fast";
  if (mode === "maximo") return "max";

  // equilibrado: barato para lo simple, sube solo en lo difícil
  if (s.multiStepFlow || s.hasImage) return "smart";
  if (s.text.length > 350) return "smart";
  if (COMPLEX_HINTS.test(s.text)) return "smart";
  if ((s.text.match(/\?/g)?.length ?? 0) >= 3) return "smart";
  return "fast";
}
