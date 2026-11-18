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

## Fase 3 · Canales de Meta y multimedia

- [ ] WhatsApp Cloud API con verificación de firma (C3) y Twilio (C4)
- [ ] Instagram + Messenger con un solo webhook (C5)
- [ ] Notas de voz con Whisper en Workers AI (A4/B5) y visión de imágenes (B5)
- [ ] Avisos de handoff por Telegram/correo/WhatsApp; pausa automática si el dueño contesta desde su app (B3)
- [ ] Pestaña Conexiones con estado verde/rojo (D11)

## Fase 4 · Superpoderes asíncronos (Cron Triggers)

- [ ] Cierre de conversación tras 3 h de silencio
- [ ] Vigilante: analista IA en 8 dimensiones + alertas + watchdog 3/30 min con freno de 6 h (B2, D7)
- [ ] Cazador de ventas con ventana 3–20 h, 1 toque de por vida, 30/día (B4)
- [ ] Encuestas 1–5 (B9), Recupera no-shows (B10), Pide reseñas (B11)
- [ ] Reporte nocturno (B7); Estadísticas día a día (D8)
- [ ] Costos del mes + tope de gasto que frena la IA al llegar (D9)

## Fase 5 · Integraciones de negocio

- [ ] Agenda: Cal.com y Google Calendar con servicios agendables y duración (C8)
- [ ] Cobros con Stripe: link de pago + webhook de confirmación (B12)
- [ ] Galería en R2: fotos, videos y audios con "cuándo usarlo" (B13)
- [ ] Herramientas propias del dueño en `member/tools.local.ts` que sobreviven actualizaciones
- [ ] Plantillas de WhatsApp (HSM) y Campañas a segmentos (C7, D10)

## Fase 6 · Giros y personalidad

- [ ] Los 14 giros: prompt, herramientas y etiquetas de panel por giro (E6)
- [ ] Modo `espejo` y detección es/en/pt (B8)
- [ ] Retrato de voz desde la web del negocio (B6)
- [ ] Prompt: versiones y deshacer, prompt por canal, ejemplos few-shot (D15)

## Fase 7 · Equipo y marca blanca

- [ ] Usuarios con rol Administrador/Equipo, invitaciones de 7 días, visibilidad por sección, bitácora, asignar chats, recuperar contraseña (D13)
- [ ] White-label: logo, colores, fuente, 3 estilos, textos del login, ocultar tabs, dominio propio (D14)

## Fase 8 · HQ multi-bot, CLI y skills

- [ ] CLI: `init`, `install <giro>`, `update` (respeta `member/`, respalda), `doctor`, `pair`, `delete`
- [ ] HQ: mis bots, estadísticas y clientes agregados en vivo, Modo Agencia con pipeline (E1–E5)
- [ ] Skills para Claude Code: configurar, reporte, afinar, prompt, cotizar, propuesta, cobrar…

## Fase 9 · App móvil (opcional)

- [ ] Bandeja en el teléfono con notificaciones push de "Te necesita"
