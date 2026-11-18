# Mapa funcional (especificación)

Inventario de todo lo que hace la plataforma de referencia, levantado el 2026-11-17 desde su
panel privado (app.forjabots.com, cuenta con plan Forja+) y su documentación pública.
Es la **especificación de producto** de Yunque: cada fila tiene un ID que el
[roadmap](03-roadmap.md) referencia.

> Implementación propia desde cero. No copiamos código, textos, prompts ni marca de la plataforma
> de referencia: solo replicamos **qué** hace, con nuestro propio diseño de **cómo**.

## Piezas del producto

| Pieza                        | Qué es                                                                                         | En Yunque           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| **Motor del bot**            | Un Worker por negocio en la cuenta Cloudflare del dueño: canales, IA, superpoderes, datos (D1) | `apps/bot`          |
| **Panel del bot** (`/admin`) | El tablero de cada negocio: bandeja, clientes, tickets, configuración, costos…                 | `apps/panel`        |
| **HQ / Cloud**               | Panel central multi-bot: mis bots, estadísticas y clientes agregados, Modo Agencia             | `apps/hq` (fase 8)  |
| **CLI**                      | `init · install · update · doctor · pair · delete`                                             | `apps/cli` (fase 8) |
| **Skills del agente**        | Guiones para Claude Code: `/reporte`, `/prompt`, `/afinar`…                                    | `skills/` (fase 8)  |
| **App móvil (Inbox)**        | Bandeja en el teléfono, tomar chats, reporte del día                                           | fase 9 (opcional)   |

## A. Habilidades base (todo bot, gratis)

| ID  | Habilidad                     | Regla concreta                                                                          |
| --- | ----------------------------- | --------------------------------------------------------------------------------------- |
| A1  | Responde 24/7 al instante     | Cada mensaje entrante se contesta en segundos                                           |
| A2  | Responde con TU información   | Fuente de verdad = perfil del negocio + base de conocimiento                            |
| A3  | Captura leads                 | Nombre y contacto de quien muestra interés → tabla de leads                             |
| A4  | Entiende notas de voz         | Transcripción (Whisper vía Workers AI)                                                  |
| A5  | Pasa al humano cuando importa | Pide humano / queja → aviso por Telegram o correo                                       |
| A6  | Voz de marca                  | Presets cercano · formal · divertido                                                    |
| A7  | Multicanal                    | Web, WhatsApp, Instagram, Messenger, Telegram                                           |
| A8  | Reportes y exportar           | Resumen de conversaciones; exportar leads/chats a CSV/JSON                              |
| A9  | Botones tocables              | Opt-in, hasta 3 opciones en elecciones cerradas; lista numerada si el canal no soporta  |
| A10 | Multi-idioma de sistema       | `es-419`, `es-ES`, `en`, `pt-BR`, `espejo` (contesta en el idioma del cliente) + moneda |
| A11 | Cerebro por niveles           | Económico (rápido) · Equilibrado (sube solo en lo difícil) · Máximo                     |
| A12 | Pausar un chat                | 30 min – 8 h o hasta reactivar                                                          |

## B. Superpoderes (13)

| ID  | Superpoder                    | Números y reglas                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | **Blindaje anti-invento**     | 4 candados: (1) reglas duras en el sistema, (2) busca antes de afirmar: top-5 pasajes, umbral 0.7, (3) verificador pre-envío de datos (precio, horario, promesa, política) → si no hay respaldo: "déjame confirmarlo" + handoff, (4) radar de huecos de los últimos 30 días                                                    |
| B2  | **Vigilante con IA**          | Conversación cerrada tras 3 h de silencio → Analista IA (modelo rápido, ~$0.001) califica 1–5★ en 8 dimensiones (calidad, sentimiento, resuelta sola, venta abierta, pregunta sin respuesta, memoria del cliente…) → alerta si cliente molesto o venta en riesgo. Watchdog de salud: 3 fallas en 30 min → alerta, freno de 6 h |
| B3  | **Handoff que sí atina**      | 4 disparadores: pide humano, >3 vueltas sin resolver, queja/facturación, tema legal. Ticket con motivo + aviso (Telegram/correo/WhatsApp). Humano responde → bot se aparta 60 min y retoma con nota. Detecta si el dueño contesta desde su propio WhatsApp                                                                     |
| B4  | **Cazador de ventas**         | Candidatos: venta abierta (Analista) o ≥4 mensajes del cliente. Ventana 3–20 h tras el último mensaje. 1 toque por conversación de por vida, máx 30/día, máx 2 líneas, en tu tono. Nunca si está pausada o si el cliente habló último                                                                                          |
| B5  | **Oído y vista**              | Voz: Whisper large-v3-turbo. Vista: imágenes con el mismo cerebro (productos, comprobantes, ubicaciones)                                                                                                                                                                                                                       |
| B6  | **Voz de marca**              | 3 presets + retrato de voz desde la web/mensajes reales. Se aplica al instante sin redeploy. Nunca toca los frenos                                                                                                                                                                                                             |
| B7  | **Reportes automáticos**      | Cada noche: conversaciones, leads nuevos, ventas calientes, clientes molestos → Telegram/correo/WhatsApp                                                                                                                                                                                                                       |
| B8  | **Multi-idioma**              | Detecta es/en/pt y responde en el idioma del cliente                                                                                                                                                                                                                                                                           |
| B9  | **Encuestas de satisfacción** | Al cerrar: 1–5 y/o comentario. Calificación baja → aviso inmediato                                                                                                                                                                                                                                                             |
| B10 | **Recupera no-shows**         | Segundo toque a leads calientes enfriados hace días. Telegram siempre; WhatsApp con plantilla aprobada                                                                                                                                                                                                                         |
| B11 | **Pide reseñas**              | Solo a clientes satisfechos, con el link de Google del negocio                                                                                                                                                                                                                                                                 |
| B12 | **Cobros por WhatsApp**       | Link de pago Stripe + aviso al confirmarse el pago (webhook)                                                                                                                                                                                                                                                                   |
| B13 | **Galería**                   | El bot manda fotos, videos y audios reales del negocio (R2), con nombre y "cuándo usarlo"                                                                                                                                                                                                                                      |

## C. Canales e integraciones

| ID  | Canal / integración       | Notas                                                                                                 |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| C1  | Chat web (widget)         | `<script>` en el sitio del negocio. Sin tokens. El más fácil                                          |
| C2  | Telegram                  | BotFather + token. Ideal para probar                                                                  |
| C3  | WhatsApp Cloud API (Meta) | Número de prueba gratis; producción requiere verificación. Regla de 24 h                              |
| C4  | WhatsApp vía Twilio       | Alternativa con BSP                                                                                   |
| C5  | Instagram DMs + Messenger | Un webhook de Meta cubre ambos                                                                        |
| C6  | Proveedores alternos      | ManyChat, Kapso/YCloud (coexistencia con la app), Zernio (multi-red)                                  |
| C7  | Plantillas WhatsApp (HSM) | Recordatorio de cita, recuperar lead, confirmación de pedido, promo, post-venta/reseña, aviso de pago |
| C8  | Agenda                    | Cal.com, Google Calendar, Calendly, Outlook                                                           |
| C9  | Apps externas             | Composio: Gmail, HubSpot, Pipedrive, Sheets, Notion, Slack…                                           |
| C10 | IA propia (BYO-LLM)       | Claude, ChatGPT, Gemini, Grok con la llave del dueño                                                  |

## D. Panel del bot (`/admin`)

| ID  | Sección             | Qué muestra / hace                                                                                                                                                                  |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Resumen             | Conversaciones 24 h, clientes únicos, leads, escalaciones, % resueltas sin humano                                                                                                   |
| D2  | Bandeja             | Todos los canales; filtros Todas / Te necesitan / Sin leer / Interesados; tomar y devolver el chat; notas internas; respuestas rápidas; sugerir respuesta con IA; asignar a alguien |
| D3  | Clientes / Leads    | Lista, estado del lead, exportar                                                                                                                                                    |
| D4  | Tickets             | Handoffs, huecos de conocimiento, avisos del sistema                                                                                                                                |
| D5  | Conocimiento        | Base de conocimiento (RAG): documentos, FAQ, clonar desde web                                                                                                                       |
| D6  | Mejoras             | Radar de huecos + propuestas para taparlos                                                                                                                                          |
| D7  | Analista / Insights | Qué querían, satisfacción, objeciones, ventas abiertas                                                                                                                              |
| D8  | Estadísticas        | Volumen, retención y desempeño día a día                                                                                                                                            |
| D9  | Costos              | Gasto de IA del mes desglosado + tope opcional                                                                                                                                      |
| D10 | Campañas            | Difusión por WhatsApp a segmentos                                                                                                                                                   |
| D11 | Conexiones          | Estado verde/rojo de cada canal                                                                                                                                                     |
| D12 | Configuración       | Cerebro estructurado: promoción, ubicación, pagos, servicios agendables (con duración), FAQ, horario con zona horaria, instrucciones (hasta 16K), voz, idioma, moneda, modelo       |
| D13 | Equipo              | Roles Administrador/Equipo, invitación por link (7 días, un uso), visibilidad por sección, bitácora, asignar chats, recuperar contraseña, 5 intentos fallidos → 15 min de bloqueo   |
| D14 | White-label         | Logo, 2 colores, 12 fuentes, 3 estilos (claro minimal, oscuro moderno, cálido editorial), nombre y textos del login, ocultar marca y tabs, dominio propio                           |
| D15 | Prompt              | Ver por secciones (lo editable vs lo bloqueado), versiones y deshacer, prompt por canal, auditoría, A/B testing, ejemplos few-shot                                                  |

## E. HQ multi-bot y Modo Agencia

| ID  | Sección                     | Qué hace                                                                                                                                                                                                  |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Mis bots                    | Bots vinculados (pairing) con host, plan y estado en vivo                                                                                                                                                 |
| E2  | Estadísticas agregadas      | Lee en vivo de cada bot (no almacena métricas)                                                                                                                                                            |
| E3  | Clientes agregados          | Leads de todos los bots juntos, leídos en vivo                                                                                                                                                            |
| E4  | Modo Agencia                | Portafolio + pipeline: ROI → demo → cliente nuevo → cotizar → propuesta → superpoderes → cobrar → reporte/mantenimiento                                                                                   |
| E5  | Equipo de agencia           | Hasta 3 colaboradores (editar / solo lectura)                                                                                                                                                             |
| E6  | Giros (14)                  | Restaurante, cafetería, panadería, barbería, salón, spa, dentista, clínica, gimnasio, coach, inmobiliaria, tienda, CRM/ventas, hotelería — cada uno con prompt, herramientas y etiquetas de panel propias |
| E7  | Novedades / actualizaciones | `update` conserva la configuración del dueño; respaldo antes de reemplazar                                                                                                                                |

## F. Comandos del agente (skills)

Operación: `/configurar-mi-chatbot`, `/afinar`, `/voz-de-marca`, `/re-nichar`, `/conectar-mi-ia`,
`/superpoderes`, `/agregar-tool`, `/botones`, `/galeria`, `/human-in-the-loop`.
Datos: `/reporte`, `/exportar`, `/analiticas`, `/mantenimiento`, `/auditoria`, `/cliente-misterioso`.
Prompt: `/prompt`, `/lab-prompt`, `/limpiar-prompt`, `/versionar-prompt`, `/prompt-por-canal`,
`/auditar-prompt`, `/ejemplos-prompt`.
Agencia: `/roi`, `/demo`, `/cliente-nuevo`, `/cotizar`, `/propuesta`, `/cobrar`, `/precios`,
`/clonar`, `/campana`, `/whitelabel`, `/ocultar-tabs`, `/equipo`.
