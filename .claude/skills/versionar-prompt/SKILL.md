---

name: versionar-prompt
description: Historial y deshacer del cerebro del bot — guarda una versión con nombre, lista las anteriores y vuelve a cualquiera. Úsala con "guarda una versión", "vuelve a la de ayer", "deshaz el último cambio", "revierte mi prompt".
---

# Versiones del prompt

- Cada vez que se guarda la configuración, la versión anterior queda sola en el historial (últimas 50).
- **Guardar ahora:** `pnpm yunque prompt:guardar "<nombre>"` (p. ej. antes de un cambio grande o una promo).
- **Ver:** `pnpm yunque prompt:versiones` → fecha, nombre, autor y un resumen (giro, tono, FAQ, largo de instrucciones).
- **Volver:** confirma con el dueño cuál, explica que la configuración actual quedará guardada como "Antes de
  restaurar", y corre `pnpm yunque prompt:restaurar <id>`. Verifica con `pnpm yunque prompt` y una prueba.
- En el panel: pestaña **Prompt** → Historial y deshacer.
