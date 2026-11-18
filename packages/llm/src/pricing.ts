import type { TokenUsage } from "./types.js";

interface Price {
  /** USD por millón de tokens. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Precios de referencia por modelo (USD / 1M tokens). Revisarlos cuando un proveedor cambie
 * tarifas: alimentan la pestaña Costos y el tope de gasto.
 */
const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0 },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
  "grok-4-fast": { input: 0.2, output: 0.5, cacheRead: 0.05, cacheWrite: 0 },
  "grok-4": { input: 3, output: 15, cacheRead: 0.75, cacheWrite: 0 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
};

function priceFor(model: string): Price | undefined {
  if (PRICES[model]) return PRICES[model];
  // modelos con sufijo de versión o fecha: usa el prefijo conocido más largo
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : undefined;
}

/** Costo en USD de una llamada. Modelo desconocido → 0 (se registra igual el uso de tokens). */
export function costUsd(model: string, usage: TokenUsage): number {
  const p = priceFor(model);
  if (!p) return 0;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}
