---

name: re-nichar
description: Cambia el giro del bot (restaurante, barbería, clínica, inmobiliaria… 14 giros) para que atienda con la guía de ese rubro, sin perder lo que el dueño ya configuró, y completa las preguntas típicas del giro. Úsala con "cambia el giro", "ahora es para una clínica", "re-nicha el bot", "¿qué giros hay?".
---

# Re-nichar (cambiar el giro)

1. `pnpm yunque giros` y muestra la lista corta (nombre y para qué sirve). Pregunta cuál (una pregunta).
2. Explica qué cambia: entra la guía de atención del giro (sección 🔒 del prompt) y, si el negocio no tenía
   servicios, se agregan los típicos **sin precio**. Nada de lo escrito por el dueño se borra y queda una versión
   para deshacer.
3. Con su sí: `pnpm yunque giro:aplicar <id>`. El comando devuelve las preguntas pendientes del giro.
4. Pregúntale esas respuestas de a una y agrégalas a las FAQ (skill `prompt`); pídele los precios de los servicios
   agregados. Nunca inventes respuestas ni precios.
5. Recomienda los superpoderes del giro (aparecen en `pnpm yunque giros`) y ofrece encenderlos con `superpoderes`.
6. Prueba 3 mensajes típicos del giro con `pnpm yunque probar`.
