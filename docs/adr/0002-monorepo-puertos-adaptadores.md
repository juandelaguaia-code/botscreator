# ADR 0002 · Monorepo con dominio puro y puertos/adaptadores

**Estado:** aceptada · 2026-11-17

## Decisión

- pnpm workspaces. Paquetes internos consumidos desde su fuente TypeScript (`exports` → `src`),
  sin paso de compilación: Wrangler (esbuild) y Vite los empaquetan.
- `packages/core` no importa nada del runtime. `apps/bot` implementa los puertos.
- El motor de conversación recibe `Store`, `LlmProvider` y reloj por inyección, así los tests corren
  en Node con implementaciones en memoria.

## Consecuencias

- Tests rápidos y deterministas sin Cloudflare ni red.
- Agregar un canal o proveedor = un adaptador nuevo, sin tocar el motor.
