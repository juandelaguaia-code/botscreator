---

name: prompt
description: Puerta de entrada para ver y editar el "cerebro" del bot. Muestra el prompt por secciones (lo editable ✏️ y lo bloqueado 🔒), edita instrucciones, datos del negocio o voz, y enruta a la skill indicada. Úsala con "quiero ver mi prompt", "edita las instrucciones del bot", "cambia cómo se comporta", "mi bot dice cosas raras".
---

# Prompt del bot

## 1. Mostrar

`pnpm yunque prompt` (o `pnpm yunque prompt whatsapp` para otro canal). Explica:

- 🔒 **Frenos de seguridad, formato del canal, idioma y botones**: los arma el sistema; no se editan.
- ✏️ **Información del negocio, voz de marca e instrucciones del dueño**: son del dueño.
- La parte "por mensaje" (fecha y pasajes de la base de conocimiento) cambia sola en cada turno.

## 2. Entender qué quiere cambiar (una pregunta)

| Si quiere…                                                            | Dónde va                              | Cómo                   |
| --------------------------------------------------------------------- | ------------------------------------- | ---------------------- |
| Que el bot se comporte distinto (reglas, cuándo escalar, cómo cerrar) | `profile.instructions`                | edición directa        |
| Corregir un precio, horario, servicio, FAQ                            | campo estructurado del perfil         | edición directa        |
| Que suene distinto                                                    | `profile.tone` o skill `voz-de-marca` |                        |
| Que sepa algo largo (políticas, catálogo)                             | base de conocimiento                  | skill `conocimiento`   |
| Un diagnóstico completo                                               | —                                     | skill `auditar-prompt` |
| Aprender de chats reales                                              | —                                     | skill `afinar`         |

## 3. Editar con seguridad

1. `mkdir -p .yunque/respaldos && pnpm -s yunque config > .yunque/respaldos/config-$(date +%F-%H%M).json` (respaldo; `.yunque/` no se sube al repo).
2. Prepara el cambio mínimo, muéstrale **antes y después** del campo y espera su sí.
3. Guarda solo la parte que cambió: archivo `{ "profile": { ...perfil completo con el cambio... } }` y
   `pnpm yunque config:guardar <archivo>`. El bot valida; si responde error, corrige y explica.
4. Verifica con `pnpm yunque probar "<una pregunta que toque el cambio>"`.

## Reglas

- Las instrucciones del dueño nunca pueden pedir saltarse los frenos (inventar precios, no escalar quejas…).
  Si lo piden, explica por qué no y ofrece la alternativa.
- Máximo 16.000 caracteres de instrucciones; datos volátiles (precios que cambian, catálogo) van a la base
  de conocimiento, no a las instrucciones.
