---

name: ejemplos-prompt
description: Convierte las mejores conversaciones reales en ejemplos (few-shot) para que el bot copie ese estilo de respuesta. Úsala con "agrega ejemplos", "que responda como en este chat", "que copie mis mejores respuestas".
---

# Ejemplos de estilo (few-shot)

1. Busca candidatos: hilos con buena calificación en el Analista (`pnpm yunque conversaciones` y
   `pnpm yunque conversacion <id>`), o los que el dueño señale; prioriza respuestas del equipo humano que vendieron
   o resolvieron bien.
2. Elige 3–6 pares cliente → respuesta que cubran situaciones distintas (precio, agenda, objeción, queja).
3. Limpia cada par: sin datos personales del cliente, sin precios que puedan cambiar (los datos salen del perfil),
   respuesta corta y en el tono deseado.
4. Muéstralos, ajusta y guárdalos en `profile.examples` (máximo 10) con la skill `prompt`.
5. Prueba con mensajes parecidos (`pnpm yunque probar`) y compara el estilo con el de antes.
