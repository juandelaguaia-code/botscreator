---

name: ocultar-tabs
description: Esconde secciones del panel a los accesos personales (Administrador y Equipo) — por ejemplo Costos o Modo agencia cuando el panel lo usa un cliente de la agencia — y las bloquea también en la API. Úsala con "oculta costos", "que mi cliente no vea X", "esconde pestañas", "simplifica el menú".
---

# Ocultar pestañas

Hay dos capas, y conviene explicarle al dueño la diferencia:

1. **Pestañas ocultas** (`settings.branding.hiddenTabs`): nadie con acceso personal las ve, sea Administrador o
   Equipo. Útil cuando la agencia entrega el panel a su cliente y no quiere mostrarle Costos o Modo agencia.
2. **Secciones del rol Equipo** (`settings.teamSections`): qué ve quien atiende. Eso se ajusta con `/equipo`.

La contraseña maestra siempre ve todo, así que nadie se queda afuera por error. Configuración nunca se oculta.

## Flujo

1. Pregunta qué quiere esconder y a quién. Muestra la lista con su ruta:
   `/` Resumen · `/bandeja` · `/clientes` · `/tickets` · `/agenda` · `/analista` · `/estadisticas` · `/costos` ·
   `/campanas` · `/mejoras` · `/conocimiento` · `/galeria` · `/superpoderes` · `/prompt` · `/conexiones` ·
   `/probar` · `/comandos` · `/agencia` · `/equipo`.
2. Lee la configuración (`pnpm yunque config`), cambia solo `settings.branding.hiddenTabs` y guarda con
   `pnpm yunque config:guardar <archivo>` tras el sí del dueño. También se hace en Configuración → Marca blanca.
3. Comprueba con un acceso de prueba (o pidiéndole a alguien del equipo que recargue): la sección desaparece del
   menú y, si se escribe la URL a mano, la API responde "Tu acceso no incluye esta sección".

## Recomendaciones para panel de cliente (agencia)

Ocultar `/costos`, `/agencia`, `/comandos` y `/prompt` deja un panel simple para el dueño del negocio sin perder
el control de la agencia, que entra con la contraseña maestra.
