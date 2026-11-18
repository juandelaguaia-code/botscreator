# Roadmap — de lo básico a lo difícil

Cada fase deja algo **funcionando y probado**. Los IDs remiten al [mapa funcional](01-mapa-funcional.md).

## Fase 0 · Fundaciones ✅

- [x] Monorepo pnpm, TypeScript estricto, Biome, Vitest, CI de GitHub Actions
- [x] Especificación funcional, arquitectura, ADRs

## Fase 1 · Motor del bot + panel mínimo ✅

- [x] Dominio: perfil estructurado del negocio, prompt por secciones con frenos bloqueados (B1.1), voz de marca por presets (A6/B6), idiomas y moneda (A10)
- [x] Proveedores de IA: Anthropic, OpenAI, Grok, Gemini, Fake; niveles de cerebro (A11); bucle de herramientas
- [x] Motor de conversación con puertos (Store / LLM / Canal) y herramientas `capturar_lead` (A3) y `pedir_humano` (A5)
- [x] Handoff: detección de "quiero un humano" sin gastar IA, ticket, takeover de 60 min al responder desde el panel (B3 parcial)
- [x] Canales: chat web con widget embebible (C1) y Telegram (C2)
- [x] D1: esquema y migraciones; registro de uso y costo por llamada
- [x] API del panel con login seguro y bloqueo por intentos
- [x] Panel: Resumen, Bandeja (tomar/devolver/pausar/notas), Clientes, Tickets, Configuración, Probar bot (D1–D4, D12 parcial)

## Fase 2 · Conocimiento y Blindaje ✅

- [x] Base de conocimiento: documentos manuales o importados desde la web, troceo, embeddings bge-m3 (Workers AI) en Vectorize; índice local en D1 para desarrollo (D5)
- [x] Pasajes por turno + herramienta `buscar_conocimiento` con top-5 y umbral 0.7 configurable (B1.2)
- [x] Verificador pre-envío: chequeo barato de cifras/promesas + veredicto estructurado del modelo rápido; si no hay respaldo, "déjame confirmarlo" + handoff (B1.3)
- [x] Radar de huecos 30 días con agrupación de dudas parecidas + pestaña Mejoras que agrega la respuesta a las FAQ (B1.4, D6)
- [x] Botones tocables opt-in en web, Telegram y Probar bot (A9)
- [x] Exportar leads y conversaciones en CSV/JSON (A8)

## Fase 3 · Canales de Meta y multimedia ✅

- [x] WhatsApp Cloud API con verificación de token y firma `X-Hub-Signature-256` (C3) y Twilio con `X-Twilio-Signature` (C4)
- [x] Instagram + Messenger con un solo webhook de Meta (C5)
- [x] Notas de voz con Whisper en Workers AI (A4/B5) y visión de imágenes (B5)
- [x] Avisos al dueño por Telegram y correo; pausa automática cuando una persona responde desde la bandeja de Meta (B3)
- [x] Botones nativos por canal y ventana de 24 h de WhatsApp con plantillas
- [x] Pestaña Conexiones con estado, webhook y secretos faltantes (D11)
- [ ] Pausa automática cuando el dueño responde desde su app de WhatsApp Business (requiere coexistencia del proveedor)

## Fase 4 · Superpoderes asíncronos (Cron Triggers) ✅

- [x] Cierre de conversación tras 3 h de silencio (cron cada 15 min)
- [x] Vigilante: analista IA con salida estructurada, memoria del cliente, alertas y watchdog 3/30 min con freno de 6 h (B2, D7)
- [x] Cazador de ventas con ventana 3–20 h, 1 toque de por vida (índice único), tope diario (B4)
- [x] Encuestas 1–5 (B9), Recupera no-shows (B10), Pide reseñas (B11)
- [x] Reporte nocturno en la zona horaria del negocio (B7); Estadísticas día a día (D8)
- [x] Costos del mes por modelo + tope de gasto que frena la IA al llegar (D9)

## Fase 5 · Integraciones de negocio ✅

- [x] Agenda: Cal.com v2 (disponibilidad y reserva) y recordatorio ~24 h antes (C8)
- [x] Cobros con Stripe Checkout: link de pago, monedas sin decimales, webhook firmado e idempotente (B12)
- [x] Galería en R2: fotos, videos, audios y PDFs con "cuándo usarlo" (B13)
- [x] Herramientas propias del dueño en `apps/bot/src/member/tools.ts`
- [x] Plantillas de WhatsApp (recordatorio, no-shows, campañas) y Campañas por segmento (C7, D10)
- [ ] Google Calendar y Calendly como alternativas a Cal.com

## Fase 6 · Giros y personalidad ✅

- [x] 14 giros + general: guía de atención por rubro, servicios típicos sin precio, preguntas a responder y superpoderes recomendados; aplicar o cambiar giro sin pisar lo del dueño (E6)
- [x] Modo `espejo` con detección es/en/pt también para los mensajes del sistema (B8)
- [x] Retrato de voz con la skill `/voz-de-marca` (B6)
- [x] Prompt: versiones y deshacer (automáticas al guardar), instrucciones por canal, ejemplos few-shot y vista por secciones (D15)
- [x] Skills: `/re-nichar`, `/versionar-prompt`, `/prompt-por-canal`, `/ejemplos-prompt`, `/lab-prompt`, `/limpiar-prompt`

## Fase 7 · Equipo y marca blanca

- [ ] Usuarios con rol Administrador/Equipo, invitaciones de 7 días, visibilidad por sección, bitácora, asignar chats, recuperar contraseña (D13)
- [ ] White-label: logo, colores, fuente, 3 estilos, textos del login, ocultar tabs, dominio propio (D14)

## Fase 8 · Modo agencia, CLI y skills (en curso)

- [x] Modo agencia: cualquier bot es tu central; portafolio con estado y métricas en vivo, bandeja de leads de todos los bots, ingreso mensual y pipeline con prompts (E1–E4)
- [x] Token de agencia por bot (`AGENCY_TOKEN`, Bearer) para operar bots de clientes
- [x] 18 skills para Claude Code (configurar, conectar, superpoderes, conocimiento, prompt, afinar, reporte, mantenimiento, cliente misterioso, cliente nuevo, cotizar, propuesta, ROI, demo, cobrar…)
- [x] CLI de operación `pnpm yunque`
- [ ] CLI de instalación: `init`, `install <giro>`, `update` (respaldo), `doctor`, `delete`
- [ ] Equipo de agencia (colaboradores con permisos) (E5)

## Fase 9 · App móvil (opcional)

- [ ] Bandeja en el teléfono con notificaciones push de "Te necesita"
