# Yunque

Plataforma propia de chatbots de IA por giro de negocio. Cada bot vive en **tu** cuenta de
Cloudflare, con **tus** llaves de IA, y trae su panel de administración en `/admin`.

> _Yunque_ es el nombre en clave del proyecto; la marca visible del panel se configura por bot.
> Implementación propia e independiente: no contiene código, textos ni marca de otras plataformas.

## Qué hace hoy (fases 1 a 5 y Modo agencia)

- **Canales:** chat web (una línea), Telegram, WhatsApp (Cloud API de Meta o Twilio), Instagram y Messenger, con botones nativos y ventana de 24 h de WhatsApp.
- **Cerebro:** Claude por defecto (ChatGPT, Grok o Gemini opcionales), niveles Económico/Equilibrado/Máximo, base de conocimiento con Workers AI + Vectorize, notas de voz e imágenes.
- **Los 13 superpoderes:** Blindaje anti-invento, Vigilante, Handoff, Cazador de ventas, Oído y vista, Voz de marca, Reportes nocturnos, Multi-idioma, Encuestas, Recupera no-shows, Pide reseñas, Cobros con Stripe y Galería, más botones tocables, agenda con Cal.com, recordatorios, campañas y tope de gasto.
- **Panel `/admin`:** Resumen, Bandeja, Clientes, Tickets, Agenda y cobros, Analista, Estadísticas, Costos, Campañas, Mejoras, Conocimiento, Galería, Superpoderes, Conexiones, Probar bot, Comandos, Modo agencia y Configuración.
- **Modo agencia:** cualquier bot es tu central: portafolio de bots de clientes en vivo, leads de todos y pipeline comercial.

Estado por fase en el [roadmap](docs/03-roadmap.md); especificación en el [mapa funcional](docs/01-mapa-funcional.md);
qué cuentas y secretos necesitas para producción en [docs/06-cuentas-y-secretos.md](docs/06-cuentas-y-secretos.md).

## Agentes y superpoderes

- **18 agentes** (skills de Claude Code) en `.claude/skills/`: configurar el bot, conectar canales,
  superpoderes, base de conocimiento, prompt, afinar, reportes, mantenimiento, cliente misterioso y modo
  agencia (cliente nuevo, ROI, demo, cotizar, propuesta, cobrar). Catálogo y reglas: [docs/04-agentes.md](docs/04-agentes.md).
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
npx wrangler r2 bucket create yunque-bot-media
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
