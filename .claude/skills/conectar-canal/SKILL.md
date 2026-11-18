---

name: conectar-canal
description: Conecta el bot a un canal — chat de la página web (el más fácil) o Telegram — y verifica que responda. WhatsApp, Instagram y Messenger llegan en la fase 3. Úsala con "conecta Telegram", "pon el chat en mi web", "conéctame WhatsApp".
---

# Conectar un canal

Pregunta cuál quiere (una pregunta). Si no sabe: el **chat web** si tiene página; si no, **Telegram** para probar.

## Chat de la página web

1. Copia el snippet del Resumen del panel (`/admin`) o arma:
   `<script src="https://<bot>.workers.dev/widget.js" data-title="Chatea con nosotros" data-color="#2563eb" defer></script>`
2. Va antes de `</body>`. En WordPress: plugin de "insertar código en el pie"; Wix/Shopify: sección de código personalizado.
3. Opcional: restringe a su dominio con `settings.widgetAllowedOrigins: ["https://sunegocio.com"]` (skill `superpoderes`).
4. Prueba escribiendo desde su web; el hilo aparece en la Bandeja como canal Web.

## Telegram

1. En Telegram, @BotFather → `/newbot` → nombre y usuario → copia el token.
2. El dueño, en SU terminal dentro de `apps/bot`: `npx wrangler secret put TELEGRAM_BOT_TOKEN`.
3. Genera un secreto: `openssl rand -hex 24` → `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`.
4. Registra el webhook (el dueño reemplaza los valores):
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<bot>.workers.dev/webhooks/telegram&secret_token=<SECRETO>"`
5. Avisos de "te necesitan": que el dueño le escriba a su bot, obtén su chat id con
   `curl https://api.telegram.org/bot<TOKEN>/getUpdates` y guárdalo con `wrangler secret put OWNER_TELEGRAM_CHAT_ID`.
6. Prueba: mensaje real desde Telegram → respuesta del bot → aparece en la Bandeja.

## WhatsApp, Instagram, Messenger

Aún no están (fase 3 del roadmap). Dilo claro y ofrece web o Telegram mientras tanto.
