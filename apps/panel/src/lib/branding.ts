import type { SessionDto } from "@yunque/core";

const STYLE_ACCENT: Record<SessionDto["branding"]["style"], string> = {
  nimbus: "#2563eb",
  onyx: "#7c3aed",
  terra: "#ea580c",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const ch = (c: number, t: number) => Math.round(c + (t - c) * amount);
  return `#${[ch(r, target[0]), ch(g, target[1]), ch(b, target[2])].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Aplica la marca blanca: tonos del color de acento, estilo (claro, oscuro o cálido), tipografía y
 * título de la pestaña. Todo el panel usa estas variables, así que no hay que tocar componentes.
 */
export function applyBranding(branding: SessionDto["branding"], botName: string): void {
  const root = document.documentElement;
  root.dataset.style = branding.style;
  const accent = branding.accentColor || STYLE_ACCENT[branding.style];
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  const dark = branding.style === "onyx";
  const shades: Record<string, string> = {
    "50": dark ? mix(accent, [22, 24, 29], 0.82) : mix(accent, white, 0.92),
    "100": dark ? mix(accent, [22, 24, 29], 0.7) : mix(accent, white, 0.82),
    "500": mix(accent, white, 0.12),
    "600": accent,
    "700": dark ? mix(accent, white, 0.25) : mix(accent, black, 0.18),
  };
  for (const [step, value] of Object.entries(shades))
    root.style.setProperty(`--color-brand-${step}`, value);

  if (branding.font && branding.font !== "Inter") {
    const id = "brand-font";
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.font)}:wght@400;500;600;700&display=swap`;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
    root.style.setProperty(
      "--font-sans",
      `"${branding.font}", ui-sans-serif, system-ui, sans-serif`,
    );
  } else {
    root.style.removeProperty("--font-sans");
  }
  document.title = branding.panelName || botName || "Panel del bot";
}
