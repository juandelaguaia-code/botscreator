---

name: superpoderes
description: Enciende, apaga y ajusta los superpoderes del bot (Blindaje anti-invento, handoff, botones, voz, idioma, cerebro de IA) y explica cómo se configura cada uno. Úsala con "activa los superpoderes", "configura el blindaje", "prende los botones", "cambia el modelo", "qué superpoderes tengo".
---

# Superpoderes

Catálogo completo con estado y números: `docs/05-superpoderes.md`. Lee la fila antes de prometer algo.

## 1. Estado actual

`pnpm yunque config` → mira `settings`. Resume en una tabla: superpoder · estado · ajuste.

## 2. Disponibles hoy y su ajuste (en `settings`)

| Superpoder                             | Campo                             | Valores                                                           |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Blindaje · verificador pre-envío       | `verifierEnabled`                 | true (recomendado)                                                |
| Blindaje · umbral de confianza         | `kbMinScore`                      | `null` = automático (0.7 con bge-m3); 0.1–0.99                    |
| Blindaje · pasajes por mensaje         | `kbTopK`                          | 1–10 (5)                                                          |
| Handoff · minutos que el bot se aparta | `takeoverMinutes`                 | 5–1440 (60)                                                       |
| Botones tocables                       | `buttonsEnabled`                  | false por defecto: **pregunta antes de prender**                  |
| Cerebro                                | `provider`, `modelMode`, `models` | anthropic/openai/xai/gemini · economico/equilibrado/maximo        |
| Voz de marca                           | `profile.tone`                    | cercano/formal/divertido (retrato a medida: skill `voz-de-marca`) |
| Multi-idioma                           | `profile.language`                | es-419, es-ES, en, pt-BR, espejo                                  |
| Anti-abuso                             | `rateLimitPer10Min`               | 5–500 (30)                                                        |

## 3. Cambiar

1. Pregunta qué quiere lograr (una pregunta), propone el ajuste y espera su sí.
2. Archivo `{ "settings": { ...settings actuales con el cambio... } }` → `pnpm yunque config:guardar <archivo>`.
3. Demuestra el efecto con `pnpm yunque probar "..."`.

## Guías rápidas

- **El bot junta todo en un mensaje o se salta pasos** → `modelMode: "maximo"`.
- **Quiero gastar menos** → `modelMode: "economico"`; muestra el costo del mes con `pnpm yunque resumen`.
- **Frena demasiadas respuestas** → revisa `pnpm yunque huecos` (fuente verifier): casi siempre falta el dato
  en el perfil o en conocimiento; agrégalo antes de bajar el umbral.
- **Proveedor sin llave** → el panel lo marca "falta la llave": guía `wrangler secret put <PROVEEDOR>_API_KEY`.

## Superpoderes automáticos (en `settings.automation`, corren cada 15 min)

| Superpoder           | Campo                            | Nota                                                      |
| -------------------- | -------------------------------- | --------------------------------------------------------- |
| Vigilante            | `vigilante`                      | Analiza al cerrar (3 h de silencio); ver pestaña Analista |
| Cazador de ventas    | `hunter`, `hunterDailyMax`       | 1 toque por conversación, ventana 3–20 h                  |
| Encuestas            | `surveys`                        | 1–5 al cerrar; calificación baja → te avisa               |
| Recupera no-shows    | `noShows`, `noShowAfterDays`     | WhatsApp necesita plantilla (`whatsappTemplates.noShow`)  |
| Pide reseñas         | `reviews` + `profile.reviewUrl`  | solo a clientes contentos, una vez por cliente            |
| Recordatorio de cita | `reminders`                      | ~24 h antes; WhatsApp con `whatsappTemplates.reminder`    |
| Reporte nocturno     | `dailyReport`, `dailyReportHour` | por Telegram o correo                                     |
| Tope de gasto        | `monthlyBudgetUsd`               | al llegar, sin IA y todo al equipo                        |

Para probar sin esperar el cron: `curl -X POST <url>/admin/api/automation/run` con sesión, o «Analizar ahora» en
el Analista.

## Integraciones

- **Agenda (Cal.com):** `settings.booking = { enabled: true, eventTypeId }` + secreto `CALCOM_API_KEY`.
- **Cobros (Stripe):** `settings.payments = { enabled, currency, maxAmount }` + `STRIPE_SECRET_KEY` y
  `STRIPE_WEBHOOK_SECRET`; webhook en Stripe a `/webhooks/stripe` (evento `checkout.session.completed`).
- **Galería:** pestaña Galería del panel (requiere el bucket R2 `MEDIA` y `PUBLIC_URL`).

Lista completa de cuentas y secretos: `docs/06-cuentas-y-secretos.md`.
