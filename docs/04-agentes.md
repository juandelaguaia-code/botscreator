# Agentes (skills de Claude Code) y CLI de operación

El bot se opera de tres formas, de más simple a más automática:

1. **Panel** `/admin` — para el dueño y su equipo.
2. **CLI** `pnpm yunque <comando>` — para scripts y agentes; habla con la API del panel, así cada cambio pasa
   por la misma validación.
3. **Agentes** — skills de Claude Code en `.claude/skills/`. Se activan escribiendo `/nombre` o pidiendo la
   tarea con tus palabras dentro de este repo. Usan el CLI por debajo.

El panel tiene la página **Comandos** con todos los prompts listos para copiar.

## Conectar el CLI con tu bot

```jsonc
// apps/bot/.yunque.json (está en .gitignore: nunca se sube)
{ "url": "https://mi-bot.mi-cuenta.workers.dev", "password": "la contraseña del panel" }
```

Sin ese archivo, el CLI usa `http://localhost:8787` y la contraseña de `apps/bot/.dev.vars`. También acepta
`YUNQUE_URL` y `YUNQUE_PASSWORD` por variable de entorno (útil para operar varios bots de clientes).

```bash
pnpm yunque ayuda
```

| Comando                                                                          | Qué hace                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `resumen`                                                                        | Números del bot (24 h, 30 días, costo del mes)                  |
| `config` / `config:guardar <archivo>`                                            | Leer / guardar `{ profile?, settings? }`                        |
| `prompt [canal]`                                                                 | Prompt por secciones, 🔒 = bloqueada                            |
| `probar "<mensaje>" [sesión]`                                                    | Hablar con el bot como cliente (canal Prueba)                   |
| `conversaciones [filtro]` / `conversacion <id>`                                  | Bandeja e hilos                                                 |
| `leads` / `tickets [estado]`                                                     | Clientes interesados y tickets                                  |
| `conocimiento` · `:agregar` · `:importar` · `:buscar` · `:borrar` · `:reindexar` | Base de conocimiento                                            |
| `huecos [estado]` · `hueco:responder` · `hueco:ignorar`                          | Radar de huecos                                                 |
| `exportar <archivo>`                                                             | `leads.csv`, `leads.json`, `messages.csv`, `conversations.json` |

## Catálogo de agentes

| Skill                 | Para qué                                                                      | Toca datos                     |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| `/configurar-bot`     | Instalación completa: entrevista, Cloudflare, secretos, deploy, canal, prueba | crea recursos (con tu sí)      |
| `/conectar-canal`     | Chat web o Telegram (WhatsApp/Meta en fase 3)                                 | secretos (los escribes tú)     |
| `/superpoderes`       | Encender y ajustar superpoderes y cerebro de IA                               | ajustes (con tu sí)            |
| `/conocimiento`       | Clonar la web, cargar documentos, probar la búsqueda                          | documentos                     |
| `/voz-de-marca`       | Preset o retrato de voz a medida                                              | instrucciones (con tu sí)      |
| `/prompt`             | Ver y editar el prompt por secciones (hub)                                    | perfil (con tu sí)             |
| `/auditar-prompt`     | Boleta de calidad y 5 arreglos priorizados                                    | solo lectura                   |
| `/re-nichar`          | Cambiar el giro (14 giros) sin perder la configuración                        | perfil (con tu sí)             |
| `/versionar-prompt`   | Guardar versiones del prompt y volver a cualquiera                            | perfil (con tu sí)             |
| `/prompt-por-canal`   | Personalidad distinta por canal                                               | perfil (con tu sí)             |
| `/ejemplos-prompt`    | Mejores chats reales como ejemplos de estilo                                  | perfil (con tu sí)             |
| `/lab-prompt`         | Variantes A/B con rúbrica y conversaciones simuladas                          | chats de prueba                |
| `/limpiar-prompt`     | Ordenar un prompt inflado sin cambiar el comportamiento                       | perfil y conocimiento (con sí) |
| `/afinar`             | Mejorar con chats reales: huecos, escalaciones, bloqueos                      | FAQ / perfil (con tu sí)       |
| `/reporte`            | Informe mensual en lenguaje de dueño                                          | solo lectura                   |
| `/exportar`           | Leads y conversaciones a CSV/JSON                                             | solo lectura                   |
| `/mantenimiento`      | Semáforo de salud y limpieza                                                  | solo lectura salvo lo aprobado |
| `/cliente-misterioso` | Clientes simulados y boleta                                                   | crea chats de prueba           |
| `/cliente-nuevo`      | Bot aislado para un negocio cliente (agencia)                                 | crea recursos (con tu sí)      |
| `/cotizar`            | Precio con costos reales y piso de margen (agencia)                           | —                              |
| `/propuesta`          | Documento comercial para cerrar (agencia)                                     | —                              |
| `/roi`                | Retorno del bot para un prospecto, en 3 escenarios (agencia)                  | —                              |
| `/demo`               | Bot de demostración con los datos públicos del prospecto (agencia)            | bot de demos                   |
| `/cobrar`             | Cobro de instalación o mensualidad con Stripe de la agencia (agencia)         | —                              |

## Reglas comunes de todos los agentes

- Una pregunta por mensaje y confirmación antes de cambiar algo, crear recursos, hacer commit o desplegar.
- Los secretos los escribe el dueño en su terminal (`wrangler secret put`); el agente nunca los repite.
- Nunca inventar datos del negocio: lo que falta se pregunta o queda vacío.
- Los frenos de seguridad no se editan; si piden saltarlos, se explica por qué y se ofrece una alternativa.
- Respaldos, reportes y propuestas se guardan en `.yunque/` (fuera del repo).

## Escribir un agente nuevo

Carpeta `.claude/skills/<nombre>/SKILL.md` con frontmatter `name` y `description` (la descripción dice
cuándo activarla, con frases reales del dueño). Cuerpo: pasos numerados, qué comando usa en cada paso, qué
necesita confirmación y qué entrega. Agrégala a este catálogo y a `apps/panel/src/lib/catalog.ts`.
