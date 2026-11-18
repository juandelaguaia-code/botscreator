# ADR 0001 · Cloudflare Workers + D1 como runtime del bot

**Estado:** aceptada · 2026-11-17

## Contexto

Cada negocio debe ser dueño de su bot y sus datos, con costo casi cero al arrancar y sin
servidores que mantener. Los canales (WhatsApp, Telegram, Meta) llegan por webhooks.

## Decisión

Un Cloudflare Worker por bot, con D1 (SQLite) para datos, Vectorize para la base de conocimiento,
Workers AI para embeddings y transcripción, R2 para la galería y Cron Triggers para los
superpoderes asíncronos. Hono como enrutador HTTP.

## Consecuencias

- Plan gratis de Cloudflare suficiente para empezar; ~US$5/mes con tráfico real.
- Sin estado en memoria entre requests: todo estado vive en D1.
- Código compatible con el runtime de Workers (Web APIs, sin módulos nativos de Node).
