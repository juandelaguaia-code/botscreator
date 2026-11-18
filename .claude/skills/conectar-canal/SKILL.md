---

name: conectar-canal
description: Conecta el bot a un canal — chat de la página web (el más fácil), Telegram, WhatsApp (Cloud API de Meta o Twilio), Instagram o Messenger — y verifica que responda. Úsala con "conecta Telegram", "pon el chat en mi web", "conéctame WhatsApp".
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

## WhatsApp (Cloud API de Meta, recomendado)

1. En developers.facebook.com crea una app de tipo Business y agrega el producto **WhatsApp**. Meta da un
   **número de prueba** gratis (hasta 5 destinatarios registrados) para empezar sin verificar el negocio.
2. El dueño guarda en SU terminal: `WHATSAPP_TOKEN` (token permanente de un usuario del sistema),
   `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET` (Configuración de la app → Básica) y `META_VERIFY_TOKEN`
   (una cadena aleatoria que inventa él).
3. En WhatsApp → Configuración → Webhook: URL `https://<bot>/webhooks/meta`, token de verificación =
   `META_VERIFY_TOKEN`, y suscribe el campo **messages**.
4. Prueba desde un número registrado. La pestaña Conexiones debe mostrar WhatsApp "Conectado" y el último mensaje.
5. Para escribir primero (recordatorios, no-shows, campañas) fuera de 24 h hacen falta **plantillas aprobadas**:
   regístralas en Meta y escribe su nombre e idioma en Configuración → Plantillas.

## WhatsApp vía Twilio

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (p. ej. `whatsapp:+14155238886`) y la variable
`PUBLIC_URL` (Twilio firma con la URL exacta). En la consola de Twilio, el webhook de mensajes entrantes apunta a
`https://<bot>/webhooks/twilio` (POST). Los botones salen como lista numerada.

## Instagram y Messenger

1. En la misma app de Meta agrega **Messenger** (e Instagram si aplica) y vincula la página de Facebook (y la
   cuenta profesional de Instagram).
2. Secretos: `META_PAGE_TOKEN` (token de la página), `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`.
3. Webhook: el mismo `https://<bot>/webhooks/meta`, suscrito a `messages` y `message_echoes` (los ecos permiten
   que el bot se aparte cuando alguien responde desde la bandeja de Meta).
4. Recuerda: fuera de 24 h, Instagram y Messenger no permiten escribir primero; el bot lo respeta solo.

## Avisos al dueño

- Telegram: `OWNER_TELEGRAM_CHAT_ID` (ver arriba).
- Correo: `RESEND_API_KEY`, `OWNER_EMAIL` y `EMAIL_FROM` con un dominio verificado en Resend.
