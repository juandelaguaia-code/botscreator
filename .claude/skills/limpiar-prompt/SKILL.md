---

name: limpiar-prompt
description: Desinfla y ordena un prompt inflado sin cambiar el comportamiento — mueve datos volátiles a la base de conocimiento o a campos del perfil, quita duplicados y contradicciones. Úsala con "mi prompt está muy largo", "ordénalo", "desinfla mi prompt", "es un monolito".
---

# Limpiar el prompt

1. `pnpm yunque prompt:guardar "Antes de limpiar"` y `pnpm yunque config`.
2. Clasifica cada línea de `profile.instructions`:
   - **Dato del negocio** (precio, horario, dirección, servicio) → su campo del perfil.
   - **Información larga o que cambia** (catálogo, políticas detalladas) → documento en conocimiento.
   - **Pregunta y respuesta** → FAQ.
   - **Regla de comportamiento** → se queda en instrucciones.
   - **Duplicado o contradicción** → se une o se pregunta al dueño cuál vale.
3. Muestra el plan (qué se mueve a dónde) y espera su sí. No cambies el significado de ninguna regla.
4. Aplica: perfil con `config:guardar`, documentos con `conocimiento:agregar`. Verifica con `pnpm yunque prompt`.
5. Corre 4–5 preguntas de antes y después (`pnpm yunque probar`) para confirmar que responde igual o mejor.
