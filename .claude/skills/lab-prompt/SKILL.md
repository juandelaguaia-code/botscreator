---

name: lab-prompt
description: Laboratorio A/B del prompt — prueba variantes de instrucciones (cada una cambia una sola cosa) con las mismas conversaciones simuladas, las califica con criterios claros y aplica la ganadora. Úsala con "prueba variantes de mi prompt", "qué versión agenda mejor", "haz A/B con mi prompt".
---

# Laboratorio de prompt

1. Pregunta qué quiere mejorar (agendar más, menos escalamientos, respuestas más cortas…) y cómo medirlo.
2. Guarda la versión actual: `pnpm yunque prompt:guardar "Lab · base"`.
3. Escribe 2–3 variantes que cambien **una sola cosa** cada una (una línea de instrucciones, el tono o un ejemplo).
4. Define 6–8 mensajes de prueba realistas (incluye una objeción y una trampa de precio) y una rúbrica de 3–5
   criterios (p. ej. pidió el siguiente paso, un dato a la vez, cero datos inventados, largo).
5. Por cada variante: guárdala, corre los mismos mensajes con sesiones nuevas (`pnpm yunque probar "<msg>" lab-<v>-<n>`),
   califica cada respuesta con la rúbrica.
6. Arma una tabla comparativa (variante × criterio) y recomienda la ganadora con las citas que lo justifican.
7. Aplica la elegida o restaura la base (`pnpm yunque prompt:restaurar <id>`). Avisa que los chats de prueba quedan
   en la Bandeja con canal "Prueba".
