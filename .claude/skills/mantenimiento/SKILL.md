---

name: mantenimiento
description: Revisión mensual de salud del bot, como un tune-up — semáforo de conversaciones, escalaciones, costo, base de conocimiento y huecos, con una lista corta de mejoras priorizadas. Solo lectura salvo lo que el dueño apruebe. Úsala con "dale mantenimiento al bot", "revisión mensual", "¿cómo está mi bot?".
---

# Mantenimiento mensual

1. **Salud técnica**: `curl -s <URL>/healthz` y `pnpm yunque resumen`. Revisa `pnpm yunque tickets` con tipo
   `system` (fallas de IA, llave vencida, límite del proveedor).
2. **Semáforo** (🟢 bien · 🟡 mirar · 🔴 actuar), con el número y su porqué:
   - % resueltas sin humano (🟢 ≥ 80 · 🟡 60–79 · 🔴 < 60)
   - tickets abiertos y "te necesitan" sin atender
   - huecos abiertos y cuántas veces se repiten
   - documentos con error o por reindexar (`pnpm yunque conocimiento`)
   - costo del mes vs. el mes anterior
3. **Limpieza de conocimiento**: documentos duplicados, obsoletos (precios viejos) o vacíos; propón qué borrar o reescribir.
4. **Top 5 mejoras** con el comando o skill que las aplica (`afinar`, `conocimiento`, `prompt`, `superpoderes`).
5. Pregunta cuáles aplicar; no cambies nada sin su sí.
