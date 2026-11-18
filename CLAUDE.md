# Guía para agentes

Monorepo pnpm de **Yunque**, plataforma propia de chatbots por giro en Cloudflare Workers.
Spec: `docs/01-mapa-funcional.md` · arquitectura: `docs/02-arquitectura.md` · plan: `docs/03-roadmap.md`.

## Reglas del proyecto

- Implementación propia: no copies código, prompts, textos ni marca de otras plataformas de bots.
- `packages/core` no importa nada de runtime (ni Hono, ni D1, ni SDKs de IA).
- El motor (`apps/bot/src/engine`) depende de puertos: `Store`, `LlmProvider`. Nuevas capacidades = nuevos adaptadores o herramientas, no `if` por canal dentro del motor.
- Entradas de la API se validan con los esquemas zod de `packages/core/src/contracts.ts`; el panel usa los mismos tipos.
- Cambios de esquema: nueva migración SQL numerada en `apps/bot/migrations` (nunca editar una ya aplicada).
- Los frenos de seguridad (`packages/core/src/prompt/guardrails.ts`) van siempre primero y no son editables por el dueño.
- Secretos solo con `wrangler secret put`; nunca en `settings`, en el repo ni en logs.
- Textos de UI y mensajes al usuario final en español.
- Claude por defecto vía SDK oficial `@anthropic-ai/sdk` (ver `packages/llm/src/providers/anthropic.ts`).

## Comandos

- `pnpm check` — lint (Biome) + tipos + tests. Debe quedar verde antes de cerrar una tarea.
- `pnpm test` — Vitest; los tests del bot corren el SQL real sobre `node:sqlite` (`apps/bot/test/helpers/sqlite-d1.ts`).
- `pnpm build && pnpm db:migrate:local && pnpm dev` — Worker local con panel en `/admin`.
- `LLM_PROVIDER=fake` en `apps/bot/.dev.vars` para probar sin llave de IA.
- `pnpm yunque <comando>` — CLI de operación contra la API del panel (`apps/bot/scripts/yunque.mjs`).

## Agentes

Las skills para operar bots están en `.claude/skills/` (catálogo en `docs/04-agentes.md`). Si agregas o
cambias una, actualiza también `apps/panel/src/lib/catalog.ts` (página Comandos del panel). Los
superpoderes se documentan en `docs/05-superpoderes.md` y en el mismo catálogo.
