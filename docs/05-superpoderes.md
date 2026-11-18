# Superpoderes · referencia técnica

Estado, reglas, dónde se configuran y cómo se implementan. Los IDs (B1…B13) remiten al
[mapa funcional](01-mapa-funcional.md); las fases, al [roadmap](03-roadmap.md). El panel muestra este
catálogo en **Superpoderes** con su estado en vivo.

|     | Superpoder                | Estado | Dónde se configura                                          |
| --- | ------------------------- | ------ | ----------------------------------------------------------- |
| B1  | Blindaje anti-invento     | ✅     | Configuración → Blindaje                                    |
| B2  | Vigilante con IA          | ✅     | Configuración → Superpoderes automáticos · pestaña Analista |
| B3  | Handoff que sí atina      | ✅     | Configuración → Comportamiento · Bandeja                    |
| B4  | Cazador de ventas         | ✅     | Configuración → Superpoderes automáticos                    |
| B5  | Oído y vista              | ✅     | Automático con Workers AI                                   |
| B6  | Voz de marca              | ✅     | Configuración → Voz e idioma · skill `/voz-de-marca`        |
| B7  | Reportes automáticos      | ✅     | Configuración → Superpoderes automáticos                    |
| B8  | Multi-idioma              | ✅     | Configuración → Voz e idioma                                |
| B9  | Encuestas de satisfacción | ✅     | Configuración → Superpoderes automáticos                    |
| B10 | Recupera no-shows         | ✅     | Configuración → Superpoderes automáticos · Plantillas       |
| B11 | Pide reseñas              | ✅     | Configuración → link de reseñas                             |
| B12 | Cobros por chat (Stripe)  | ✅     | Configuración → Agenda y cobros                             |
| B13 | Galería                   | ✅     | Pestaña Galería                                             |
| A9  | Botones tocables          | ✅     | Configuración → Botones                                     |

Todos los superpoderes automáticos corren con el cron cada 15 minutos (`apps/bot/src/automation/runner.ts`);
`POST /admin/api/automation/run` (o «Analizar ahora» en el Analista) lo corre a mano. Cada paso es independiente:
si uno falla, los demás siguen y el error queda en el reporte.

## Activos

### B1 · Blindaje anti-invento

- **Frenos** (`packages/core/src/prompt/guardrails.ts`): primera sección del prompt, bloqueada.
- **Busca antes de afirmar**: en cada mensaje se consultan `kbTopK` pasajes (5) y solo entran al prompt los que
  superan `kbMinScore` (`null` = el recomendado del motor: 0.7 con bge-m3). Herramienta `buscar_conocimiento`
  para búsquedas extra. Código: `apps/bot/src/knowledge/service.ts`.
- **Verificador pre-envío** (`apps/bot/src/engine/verifier.ts`): chequeo barato de cifras y palabras de promesa
  contra la fuente (perfil + instrucciones + pasajes + lo dicho en el chat + fecha); solo si hay sospechas, el
  modelo rápido da un veredicto JSON. Sin respaldo → mensaje "déjame confirmarlo", handoff y hueco en el radar.
  Si el veredicto no se puede leer, deja pasar la respuesta (prioriza disponibilidad).
- **Radar de huecos** (30 días): búsquedas sin resultado, datos faltantes al escalar y bloqueos del verificador;
  agrupa dudas parecidas. Pestaña **Mejoras**: responder agrega la FAQ al perfil.
- **Ajustes**: `verifierEnabled`, `kbMinScore`, `kbTopK` (Configuración → Blindaje).

### B3 · Handoff que sí atina

- Hoy: "quiero una persona" se detecta sin IA (`packages/core/src/handoff.ts`); queja, facturación, legal o
  más de tres vueltas sin resolver los decide el modelo con `pedir_humano` (con `missing_info` opcional).
  Un ticket por conversación, aviso por Telegram (`OWNER_TELEGRAM_CHAT_ID`), takeover de `takeoverMinutes` (60)
  al responder desde el panel, pausa manual de 30 min a 8 h o indefinida.
- Avisos por Telegram y correo (`OWNER_TELEGRAM_CHAT_ID`, `RESEND_API_KEY` + `OWNER_EMAIL` + `EMAIL_FROM`). Si una persona responde desde la bandeja de Meta (Instagram/Messenger), el bot detecta el eco y se aparta. Pendiente: lo mismo desde la app de WhatsApp Business (requiere coexistencia del proveedor).

### B6 · Voz de marca

`profile.tone` (cercano / formal / divertido) en `packages/core/src/prompt/voice.ts`, aplicado al siguiente
mensaje. Retrato a medida con la skill `/voz-de-marca` (va en las instrucciones). Nunca toca los frenos.

### B8 · Multi-idioma

`profile.language`: `es-419`, `es-ES`, `en`, `pt-BR` o `espejo`. Mensajes de sistema en `packages/core/src/i18n.ts`.
Moneda en `profile.currency`.

### A9 · Botones tocables

`buttonsEnabled` (apagado por defecto). El modelo marca `[[opciones: A | B | C]]`; `extractButtons` lo separa
y cada canal lo dibuja (web y Telegram con botones; otros con lista numerada vía `buttonsAsText`).

## Implementación de los automáticos

### B2 · Vigilante con IA

Cron cada 15 min: conversaciones con 3 h de silencio → `status = closed` → análisis con el modelo rápido y salida
estructurada: calidad 1–5, sentimiento, resuelta sin humano, venta abierta, pregunta sin respuesta, objeción
principal, resumen y memoria del cliente. Alerta (Telegram) si cliente molesto o venta en riesgo. Watchdog:
3 fallas de IA en 30 min → alerta, con freno de 6 h. Tabla `conversation_insights`; pestaña Analista. Las preguntas sin respuesta van al radar de huecos.

### B4 · Cazador de ventas

Candidatas: venta abierta (Vigilante) o ≥ 4 mensajes del cliente. Ventana 3–20 h desde el último mensaje del
cliente; el cliente no puede ser el último en hablar; conversación no pausada. Un toque por conversación de por
vida (`followups` con único por conversación), máximo 30 al día, ≤ 2 líneas en la voz de marca. Todas las
garantías como tests.

### B5 · Oído y vista

Notas de voz → Whisper (`@cf/openai/whisper-large-v3-turbo`) en Workers AI; imágenes → partes `image` (el motor
ya las soporta) con el modelo inteligente.

### B7 · Reportes automáticos

Cron nocturno en la zona horaria del negocio: conversaciones, leads nuevos, ventas calientes, clientes molestos;
por Telegram o correo. Hoy: skill `/reporte` a pedido.

### B9 · Encuestas · B10 · Recupera no-shows · B11 · Pide reseñas

Encuesta 1–5 y/o comentario al cerrar; baja → aviso inmediato. No-shows: segundo toque a leads calientes enfriados
días atrás (WhatsApp fuera de 24 h con plantilla aprobada). Reseñas: solo con satisfacción alta y con
`profile.reviewUrl` configurado. Índices únicos: una encuesta por conversación, una invitación a reseña y un rescate de no-show por cliente.

### B12 · Cobros por chat

Herramienta `crear_link_de_pago` (Stripe Payment Links, llave como secreto) + webhook firmado de confirmación →
mensaje al cliente y aviso al dueño.

### B13 · Galería

Archivos en R2 con nombre y "cuándo usarlo"; herramienta `enviar_archivo`; envío nativo por canal o link.
