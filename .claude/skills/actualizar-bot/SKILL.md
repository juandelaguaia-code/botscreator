---

name: actualizar-bot
description: Lleva un bot (o todos los de la agencia) a la última versión del repo sin perder nada — respaldo de la base, migraciones y despliegue — y explica qué cambió. Úsala con "actualiza mi bot", "hay versión nueva", "pasa los bots a la última versión", "aplica las mejoras al bot del cliente".
---

# Actualizar bots

La configuración del dueño (perfil, superpoderes, marca, equipo) vive en la base del bot, no en el código: una
actualización no la toca. Igual se respalda antes, siempre.

1. **Qué hay de nuevo**: `git log --oneline -n 20` y `pnpm bot doctor <bot>` (muestra la versión desplegada, la
   del repo y si hay migraciones pendientes). Resume en 3–5 líneas, en lenguaje de dueño, qué mejora.
2. Si el repo tiene cambios sin bajar y el dueño lo aprueba: `git pull --ff-only` y `pnpm install`.
3. Corre `pnpm check`: no se actualiza un bot con la verificación en rojo.
4. Con su sí:
   - un bot: `pnpm bot actualizar <bot>`
   - todos los de la agencia: `pnpm bot actualizar --todos` (si uno falla, sigue con los demás y lo reporta).
     Cada uno: respaldo en `.yunque/respaldos/`, configuración regenerada desde la plantilla, migraciones y despliegue.
5. Verifica con `pnpm bot doctor <bot>` y una prueba real: `pnpm yunque probar "¿a qué hora abren?"`.
6. Si algo salió mal: el respaldo `.sql` se puede restaurar en una base nueva con
   `wrangler d1 execute <base> --remote --file <respaldo.sql>` (solo con el sí del dueño; explica el impacto).

Nunca uses `--sin-respaldo` salvo que el dueño lo pida explícitamente.
