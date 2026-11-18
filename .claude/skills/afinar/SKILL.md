---

name: afinar
description: Hace al bot más listo aprendiendo de sus conversaciones reales — revisa escalaciones, bloqueos del Blindaje y el radar de huecos, y propone cambios concretos al perfil, FAQ o base de conocimiento. Úsala con "afina el bot", "que aprenda de los chats", "mejora las respuestas", "¿qué no supo contestar?".
---

# Afinar con chats reales

1. **Junta lo de los últimos 30 días**
   - `pnpm yunque huecos` (lo que no supo; `hits` = cuántas veces).
   - `pnpm yunque tickets all` (motivos de escalamiento).
   - `pnpm yunque conversaciones needs_human` y 10 hilos recientes con `pnpm yunque conversacion <id>`.
   - En los hilos, busca mensajes del bot con `meta.blocked` (el Blindaje frenó un dato).
2. **Agrupa por causa** (máximo 8 grupos): dato faltante · dato ambiguo · regla de escalamiento mal puesta ·
   tono · flujo de venta que se cae.
3. **Propón un cambio por grupo**, con el texto exacto:
   - Dato faltante corto → FAQ o campo del perfil. Largo → documento en conocimiento.
   - Hueco repetido → `pnpm yunque hueco:responder <id> "<respuesta>"` (lo agrega a las FAQ).
   - Comportamiento → una línea en `profile.instructions` (skill `prompt`).
4. **Pide aprobación** del lote (puede elegir cuáles). Aplica solo lo aprobado.
5. **Verifica**: repite con `pnpm yunque probar` 2–3 preguntas reales que antes fallaban y muestra el antes/después.

Nunca inventes la respuesta a un hueco: si el dato no está en ningún lado, pregúntaselo al dueño.
