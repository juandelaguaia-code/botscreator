# Yunque

Plataforma propia de chatbots de IA por giro de negocio. Cada bot vive en **tu** cuenta de
Cloudflare, con **tus** llaves de IA, y trae su panel de administración en `/admin`.

> _Yunque_ es el nombre en clave del proyecto; la marca visible del panel se configura por bot.
> Implementación propia e independiente: no contiene código, textos ni marca de otras plataformas.

## Qué hace hoy (fases 1 y 2)

- Atiende 24/7 en el **chat de tu web** (widget de una línea) y en **Telegram**.
- Responde solo con la información de tu negocio (perfil estructurado) y con **frenos de seguridad** que el dueño no puede desactivar.
- **Captura leads** y **pasa a una persona** cuando lo piden, hay queja, facturación o tema legal; abre ticket y avisa al dueño por Telegram.
- Cuando respondes desde el panel, el bot **se aparta 60 min** y luego retoma sabiendo lo que dijiste.
- IA intercambiable: **Claude** (por defecto), ChatGPT, Grok o Gemini, en niveles Económico / Equilibrado / Máximo. Registra tokens y costo de cada respuesta.
- **Base de conocimiento** (Workers AI + Vectorize) y **Blindaje anti-invento**: verifica precios, horarios y promesas antes de enviar; lo que no sabe va al radar de huecos (pestaña Mejoras).
- Botones tocables opcionales y exportación de leads/conversaciones en CSV y JSON.
- Panel: Resumen, Bandeja (tomar/devolver/pausar/notas), Clientes (exportar CSV), Tickets, Probar bot y Configuración.

Lo que viene está en el [roadmap](docs/03-roadmap.md); la especificación completa en el
[mapa funcional](docs/01-mapa-funcional.md).

## Agentes y superpoderes

- **15 agentes** (skills de Claude Code) en `.claude/skills/`: configurar el bot, conectar canales,
  superpoderes, base de conocimiento, prompt, afinar, reportes, mantenimiento, cliente misterioso y modo
  agencia. Catálogo y reglas: [docs/04-agentes.md](docs/04-agentes.md).
- **CLI de operación** `pnpm yunque <comando>` que usan los agentes (`pnpm yunque ayuda`).
- **Superpoderes**: estado, reglas y configuración en [docs/05-superpoderes.md](docs/05-superpoderes.md).
- En el panel, **Superpoderes** y **Comandos** muestran todo con prompts listos para copiar.

## Requisitos

- Node.js ≥ 22 (recomendado 24, ver `.nvmrc`) y pnpm 9
- Una cuenta de Cloudflare (gratis) para desplegar
- Una llave de IA (Anthropic, OpenAI, xAI o Google) — opcional en desarrollo

## Desarrollo local

```bash
pnpm install
cp apps/bot/.dev.vars.example apps/bot/.dev.vars   # define DASHBOARD_PASSWORD; LLM_PROVIDER=fake no necesita llave
pnpm build                                          # compila el panel que sirve el Worker
pnpm db:migrate:local                               # crea las tablas en la D1 local
pnpm dev                                            # Worker en http://localhost:8787 (panel en /admin)
```

Para trabajar en el panel con recarga en caliente, deja `pnpm dev` corriendo y en otra terminal:

```bash
pnpm dev:panel                                      # http://localhost:5173/admin/ (API reenviada al 8787)
```

Calidad (lo mismo que corre la CI):

```bash
pnpm check                                          # lint + tipos + tests
```

## Desplegar un bot

```bash
cd apps/bot
npx wrangler login
npx wrangler d1 create yunque_bot_db                # copia el database_id a wrangler.jsonc
npx wrangler vectorize create yunque_bot_kb --dimensions=1024 --metric=cosine
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler secret put ANTHROPIC_API_KEY           # o OPENAI_API_KEY / XAI_API_KEY / GEMINI_API_KEY
pnpm db:migrate:remote
cd ../.. && pnpm deploy
```

Cada bot necesita su **propia** base D1 y su propio nombre de Worker: nunca reutilices los de otro
bot. En `wrangler.jsonc` cambia `name`, `database_name` y la variable `BOT_NAME`.

### Conectar Telegram

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN          # token de @BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # una cadena aleatoria
npx wrangler secret put OWNER_TELEGRAM_CHAT_ID      # opcional: tu chat, para avisos de handoff
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<tu-worker>.workers.dev/webhooks/telegram&secret_token=<SECRETO>"
```

### Poner el chat en tu web

El Resumen del panel muestra la línea lista para copiar:

```html
<script src="https://<tu-worker>.workers.dev/widget.js" data-title="Chatea con nosotros" data-color="#2563eb" defer></script>
```

## Estructura

```
packages/core   dominio puro: perfil del negocio, prompt con frenos, handoff, enrutamiento, contratos
packages/llm    proveedores de IA (Claude, OpenAI, Grok, Gemini, fake) + bucle de herramientas
apps/bot        Cloudflare Worker: canales, motor de conversación, API del panel, migraciones D1
apps/panel      panel /admin (React + Vite + Tailwind)
docs/           especificación, arquitectura, roadmap y decisiones (ADR)
```

Detalle en [docs/02-arquitectura.md](docs/02-arquitectura.md).
