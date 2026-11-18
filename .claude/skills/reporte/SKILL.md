---

name: reporte
description: Informe mensual de valor del bot en lenguaje de dueño de negocio — conversaciones atendidas, porcentaje resuelto sin humano, leads, escalaciones, huecos tapados y costo de IA. Solo lectura. Úsala con "hazme el reporte del mes", "cómo le fue al bot", "informe para el cliente".
---

# Reporte mensual (solo lectura)

1. Datos: `pnpm yunque resumen`, `pnpm yunque leads`, `pnpm yunque tickets all`, `pnpm yunque huecos resolved`,
   y para el detalle del mes `pnpm yunque exportar conversations.json .yunque/reportes/conversaciones.json`.
2. Calcula del mes: conversaciones, mensajes, clientes únicos, % resueltas sin humano, leads nuevos (y por estado),
   escalaciones y sus motivos principales, huecos resueltos, costo de IA (y costo por conversación).
3. Escribe `.yunque/reportes/reporte-<AAAA-MM>.md`:
   - Titular con el número que más importa al dueño.
   - 4–6 indicadores con una frase de interpretación cada uno.
   - Lo que mejoró (huecos tapados, cambios hechos) y 3 recomendaciones para el próximo mes.
   - Sin jerga técnica; cifras redondeadas; nada de datos personales de clientes.
4. Muestra el resumen en el chat y la ruta del archivo.
