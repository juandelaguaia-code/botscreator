---

name: equipo
description: Da accesos personales al panel — invita personas con su correo, elige el rol (Administrador ve todo; Equipo solo las secciones elegidas), genera links nuevos, desactiva accesos y revisa la bitácora. Úsala con "invita a mi equipo", "dale acceso a mi asistente", "que mi socio entre al panel", "quién cambió esto".
---

# Equipo y accesos

El panel tiene dos formas de entrar: la **contraseña maestra** (secreto `DASHBOARD_PASSWORD`, la del dueño,
ve todo) y los **accesos personales** (correo + contraseña de cada persona). Esta skill administra los segundos.

## Antes de empezar

- Confirma que el CLI conecta: `pnpm yunque equipo`. Si falla, revisa `apps/bot/.yunque.json` (ver `docs/04-agentes.md`).
- Si el bot no tiene la migración `0007_team.sql`, aplícala primero (`pnpm db:migrate:remote`, con el sí del dueño).

## Flujo

1. Pregunta **quién** (nombre y correo) y **para qué** entra. Con eso eliges el rol:
   - **Administrador**: socios o encargados que configuran el bot. Ve todo salvo las pestañas ocultas por la marca blanca.
   - **Equipo**: quien atiende clientes. Solo ve las secciones elegidas; Configuración, Conexiones, Costos, Prompt,
     Modo agencia y Equipo quedan siempre fuera, y la API también lo bloquea.
2. Invita: `pnpm yunque equipo:invitar "Nombre" correo@negocio.com team` (o `admin`). Devuelve un link de un solo uso
   que vale 7 días. **No lo publiques en ningún lado**: dáselo al dueño para que se lo mande a la persona por WhatsApp o correo.
3. Ajusta qué ve el rol Equipo si hace falta: `pnpm yunque equipo:secciones /,/bandeja,/clientes,/tickets`.
4. Cuando la persona active su acceso, el panel crea un ticket avisando. Ya puede entrar en `/admin` con su correo.

## Mantenimiento

- **Perdió el link u olvidó su contraseña**: `pnpm yunque equipo:link <id>` (link de 1 hora para elegir otra).
  Si el bot tiene correo configurado (`RESEND_API_KEY` + `EMAIL_FROM`), la persona también puede usar
  "¿Olvidaste tu contraseña?" en la entrada; sin correo, el link llega al Administrador como ticket.
- **Se fue del negocio**: `pnpm yunque equipo:desactivar <id>`. Sus sesiones abiertas dejan de servir al instante.
  Cambiar su contraseña también cierra sus sesiones.
- **¿Quién hizo qué?**: `pnpm yunque bitacora` (entradas al panel, invitaciones, cambios de acceso, asignaciones).
- **Asignar chats**: en la Bandeja, el selector "Asignado a" deja una conversación a cargo de alguien (le llega un
  correo si el bot tiene correo configurado).

## Reglas

- Nunca pidas ni escribas contraseñas de otras personas: cada una elige la suya desde su link.
- No compartas la contraseña maestra con el equipo; para eso están los accesos personales.
- Todo esto también se hace desde el panel, en **Equipo**.
