---

name: auditar-prompt
description: Diagnóstico de solo lectura del prompt y la configuración del bot, con boleta de calificación y arreglos priorizados. No cambia nada. Úsala con "revisa mi prompt a fondo", "califica mi bot", "¿qué le falta a mi bot?".
---

# Auditar el prompt (solo lectura)

1. Junta evidencia: `pnpm yunque prompt`, `pnpm yunque config`, `pnpm yunque huecos`, `pnpm yunque tickets all`
   y una muestra de 10 hilos recientes (`pnpm yunque conversaciones` → `pnpm yunque conversacion <id>`).
2. Califica de 1 a 5 cada criterio, con una cita breve como evidencia:

| Criterio              | Qué mirar                                                                |
| --------------------- | ------------------------------------------------------------------------ |
| Datos completos       | precios, horario con zona horaria, ubicación, pagos, contacto            |
| FAQ útiles            | cubren las preguntas reales de los chats y del radar de huecos           |
| Instrucciones claras  | reglas concretas y verificables, sin contradicciones ni relleno          |
| Escalamiento          | dice cuándo pasar a humano en términos del negocio                       |
| Datos en su lugar     | nada volátil o muy largo metido en instrucciones (eso va a conocimiento) |
| Voz consistente       | el tono configurado coincide con cómo responde en los hilos              |
| Huecos abiertos       | cuántos y cuántas veces se repiten                                       |
| Bloqueos del Blindaje | respuestas frenadas: ¿falta un dato en la fuente?                        |

3. Entrega: boleta (tabla), nota global, y **máximo 5 arreglos** ordenados por impacto, cada uno con el
   cambio exacto propuesto y la skill que lo aplica (`prompt`, `conocimiento`, `afinar`, `voz-de-marca`).
4. No apliques nada: pregunta cuál quiere hacer primero.
