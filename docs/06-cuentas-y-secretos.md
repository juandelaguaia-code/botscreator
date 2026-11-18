# Cuentas y secretos para salir a producción

Todo se programa y se prueba en local sin cuentas: los tests simulan WhatsApp, Instagram, Messenger,
Telegram, Stripe y Cal.com con los mismos mensajes que mandan los servicios reales. Las cuentas solo hacen
falta para atender a clientes de verdad. Cada secreto se guarda en la terminal del dueño, dentro de `apps/bot`:

```bash
npx wrangler secret put NOMBRE_DEL_SECRETO
```

Nunca se escriben en el repo, en el chat ni en la base de datos.

## Mínimo para arrancar

| Qué                           | Para qué                         | Secretos / recursos                                                       |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| Cuenta de Cloudflare (gratis) | Donde vive el bot                | `wrangler login`; `d1 create`, `vectorize create`, `r2 bucket create`     |
| Llave de IA                   | El cerebro                       | `ANTHROPIC_API_KEY` (o `OPENAI_API_KEY`, `XAI_API_KEY`, `GEMINI_API_KEY`) |
| Contraseña del panel          | Entrar a `/admin`                | `DASHBOARD_PASSWORD`                                                      |
| URL pública                   | Links en avisos, pagos y Galería | variable `PUBLIC_URL` en `wrangler.jsonc`                                 |

Workers AI (búsqueda en conocimiento y notas de voz) viene incluido en la cuenta de Cloudflare.

## Canales

| Canal                        | Qué crear                                                                        | Secretos                                                                             | Webhook                             |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| Chat web                     | nada                                                                             | —                                                                                    | —                                   |
| Telegram                     | bot en @BotFather                                                                | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`                                      | `/webhooks/telegram`                |
| WhatsApp (Meta, recomendado) | app en developers.facebook.com con el producto WhatsApp; número de prueba gratis | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | `/webhooks/meta` (campo `messages`) |
| WhatsApp (Twilio)            | cuenta de Twilio con sandbox o número                                            | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`                    | `/webhooks/twilio`                  |
| Instagram y Messenger        | la misma app de Meta + página de Facebook vinculada                              | `META_PAGE_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`             | `/webhooks/meta`                    |

La pestaña **Conexiones** del panel muestra qué falta de cada canal y la URL exacta del webhook.

## Avisos al dueño

| Por             | Secretos                                                                     |
| --------------- | ---------------------------------------------------------------------------- |
| Telegram        | `TELEGRAM_BOT_TOKEN` + `OWNER_TELEGRAM_CHAT_ID`                              |
| Correo (Resend) | `RESEND_API_KEY`, `OWNER_EMAIL`, `EMAIL_FROM` (dominio verificado en Resend) |

El mismo correo (Resend) manda los links de "¿Olvidaste tu contraseña?" y el aviso de chat asignado al
equipo. Sin correo configurado, el link de recuperación llega al Administrador como ticket en el panel.

## Integraciones

| Superpoder             | Qué crear                                                                                                           | Secretos y ajustes                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Agenda                 | cuenta de Cal.com con un tipo de evento                                                                             | `CALCOM_API_KEY`; en Configuración: id del evento                             |
| Cobros                 | cuenta de Stripe (modo prueba primero) y un webhook a `/webhooks/stripe` con el evento `checkout.session.completed` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; en Configuración: moneda y tope |
| Pide reseñas           | tu link de reseñas de Google                                                                                        | en Configuración                                                              |
| Plantillas de WhatsApp | plantillas aprobadas en Meta (o Content en Twilio)                                                                  | en Configuración → Plantillas                                                 |
| Modo agencia           | en cada bot de cliente, un token largo                                                                              | `AGENCY_TOKEN` (en el bot del cliente)                                        |

## Cómo probar con datos reales sin riesgo

1. Despliega con `LLM_PROVIDER=anthropic` y la llave real; prueba en **Probar bot**.
2. Conecta Telegram (5 minutos, sin verificación) y escríbele desde tu teléfono.
3. WhatsApp con el **número de prueba de Meta** (hasta 5 números registrados, sin verificar el negocio).
4. Stripe en **modo prueba** con la tarjeta de prueba de Stripe; mira el pago pasar a "Pagado" en Agenda y cobros.
5. Cal.com con un evento de prueba en tu propio calendario.
6. Corre `/cliente-misterioso` antes de abrirlo a clientes reales.
