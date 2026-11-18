---

name: equipo-agencia
description: Modo agencia — suma hasta 3 colaboradores de la agencia a Modo agencia con permiso de editar (agregar y quitar bots) o solo lectura, y vincula bots de clientes a la central. Úsala con "dale acceso a Modo agencia a mi socio", "colaboradores de la agencia", "que mi asistente vea el portafolio", "vincula este bot a mi central".
---

# Equipo de agencia

Modo agencia es del dueño de la central. Nadie más lo ve (ni los Administradores) salvo los colaboradores que
él elija: **hasta 3**, cada uno con permiso **Puede editar** o **Solo lectura**. El permiso se aplica también en
la API.

## Sumar colaboradores

1. La persona necesita un acceso personal activo en la central: si no lo tiene, invítala con `/equipo`
   (rol Equipo basta; Modo agencia se habilita aparte).
2. En la central → **Modo agencia → Equipo de agencia**: elige a la persona y su permiso. Solo se puede hacer
   entrando con la contraseña maestra (es decisión del dueño).
3. Recomienda **Solo lectura** para quien solo da seguimiento y **Puede editar** para quien monta bots.
4. Quitar el permiso le cierra la sección al instante. Todo queda en la bitácora (`pnpm yunque bitacora`).

## Vincular bots de clientes

- Bot montado con el instalador: `pnpm bot vincular <bot> [--mensualidad <monto>]`. Usa la conexión de
  `apps/bot/.yunque.json` (la de tu central), genera un token nuevo, lo guarda en el bot del cliente y lo agrega
  o renueva en tu portafolio. Repetirlo rota el token.
- Bot montado a mano: Modo agencia → "Agregar el bot de un cliente" con su URL y su `AGENCY_TOKEN`.
