# Arquitectura

## Principios

1. **Cada bot es del dueño.** Corre en su cuenta de Cloudflare, con sus llaves y sus datos. No hay
   servidor central del que dependa para atender clientes.
2. **Dominio puro, adaptadores en el borde.** Las reglas de negocio (prompt, frenos, handoff,
   enrutamiento de modelo) viven en `packages/core`, sin dependencias de runtime. El Worker solo
   conecta: HTTP, base de datos, canales, proveedores de IA.
3. **Puertos y adaptadores.** El motor de conversación depende de interfaces (`Store`,
   `LlmProvider`, `ChannelAdapter`). En producción usa D1 + Anthropic; en tests, memoria + un
   proveedor falso. Por eso el motor se prueba sin red ni Cloudflare.
4. **Configuración en datos, no en código.** Todo lo que el dueño cambia (perfil del negocio, voz,
   idioma, modelo, superpoderes) vive en la tabla `settings` y aplica al siguiente mensaje, sin
   redeploy.
5. **Los frenos no se editan.** El prompt se arma por secciones; las de seguridad son bloqueadas
   y siempre van primero. El dueño edita solo lo suyo.

## Mapa del repositorio

```
packages/
  core/      Dominio: perfil del negocio, armado del prompt, frenos, handoff, enrutamiento,
             i18n y contratos de la API (zod) compartidos con el panel.
  llm/       Proveedores de IA detrás de una interfaz neutral + bucle de herramientas.
             Anthropic (SDK oficial), OpenAI / Grok / Gemini (API compatible), Fake (tests).
apps/
  bot/       Cloudflare Worker (Hono): canales, motor de conversación, API del panel,
             migraciones D1. Sirve el panel compilado en /admin.
  panel/     SPA React + Vite + Tailwind: el /admin de cada bot.
docs/        Especificación, arquitectura, roadmap y decisiones (ADR).
```

## Flujo de un mensaje

```
Canal (web / Telegram / WhatsApp…)
  └─▶ ChannelAdapter.parse()        normaliza a InboundMessage
        └─▶ ConversationEngine.handleInbound()
              1. upsert contacto + conversación abierta
              2. guarda el mensaje del cliente
              3. ¿pausada (humano al mando) o bot apagado?  → no responde
              4. ¿pidió humano explícitamente?             → ticket + acuse, sin gastar IA
              5. arma el prompt (frenos 🔒 + negocio + voz + instrucciones)
              6. elige modelo (económico / equilibrado / máximo)
              7. bucle de herramientas: capturar_lead, pedir_humano, …
              8. guarda respuesta + uso (tokens, costo)
        └─▶ ChannelAdapter.send()        entrega la respuesta
```

## Datos (D1 / SQLite)

| Tabla            | Propósito                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `settings`       | Clave → JSON. `business_profile`, `bot_settings`                          |
| `contacts`       | Una persona por canal (`channel` + `external_id` únicos)                  |
| `conversations`  | Hilo abierto/cerrado, `paused_until` (takeover), `needs_human`, no leídos |
| `messages`       | `user` · `assistant` · `human` (equipo) · `note` (interna)                |
| `leads`          | Interesados capturados por el bot, con estado de seguimiento              |
| `tickets`        | Handoffs, huecos de conocimiento, avisos del sistema                      |
| `llm_usage`      | Tokens y costo por llamada (pestaña Costos y tope de gasto)               |
| `login_attempts` | Bloqueo tras 5 intentos fallidos (15 min)                                 |

Las migraciones son SQL plano versionado en `apps/bot/migrations` y se aplican con
`wrangler d1 migrations apply`.

## Seguridad

- Llaves de IA y tokens de canal como **secretos de Cloudflare** (`wrangler secret put`), nunca
  en el repo ni en `settings`.
- Panel: contraseña maestra (`DASHBOARD_PASSWORD`) → sesión firmada con HMAC-SHA256 en cookie
  `HttpOnly; Secure; SameSite=Strict`. Comparación en tiempo constante. Bloqueo por IP.
- Webhooks: Telegram valida `X-Telegram-Bot-Api-Secret-Token`; Meta valida la firma
  `X-Hub-Signature-256` (fase 3).
- Endpoint público del widget: límite de mensajes por conversación para frenar abuso.

## Modelos de IA

| Nivel       | Anthropic (por defecto) | Uso                                                                 |
| ----------- | ----------------------- | ------------------------------------------------------------------- |
| Rápido      | `claude-haiku-5-5`      | Charla simple en modo Económico/Equilibrado; analista del Vigilante |
| Inteligente | `claude-sonnet-5-5`     | Flujos de varios pasos (agenda, pedidos) en Equilibrado             |
| Máximo      | `claude-opus-5-5`       | Modo Máximo                                                         |

Los IDs son configurables por bot. El adaptador de Anthropic usa el SDK oficial, caché de prompt
sobre el bloque estable del sistema, esfuerzo bajo/medio para respuestas de chat y, en los
modelos que lo admiten, el _fallback_ del lado del servidor ante rechazos.
