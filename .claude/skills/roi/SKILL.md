---

name: roi
description: Modo agencia — calcula el retorno de un bot para un prospecto (horas recuperadas, ventas por responder más rápido, costo real del bot y meses para recuperar la inversión) con supuestos explícitos, listo para la reunión. Úsala con "calcula el ROI", "¿cuánto le ahorra?", "¿se paga solo?", "números para el prospecto".
---

# ROI de un bot

1. Pregunta (una por mensaje, ofrece un valor típico si no sabe): mensajes que recibe al día · minutos que
   tarda hoy en responder · cuánto cuesta una hora de quien responde · ticket promedio · % de interesados que
   compran hoy · horario sin atención (noches, fines de semana) · moneda.
2. Calcula **en tres escenarios** (conservador, esperado, optimista) y muestra cada fórmula:
   - Horas recuperadas al mes = mensajes/día × 30 × minutos por mensaje × % que resuelve el bot ÷ 60.
     Usa 60 / 75 / 85 % resuelto sin humano.
   - Ahorro = horas × costo hora.
   - Ventas extra por responder en segundos y fuera de horario = interesados que hoy se pierden × tasa de cierre ×
     ticket. Sé prudente: +5 / +10 / +15 % de conversión.
   - Costo del bot = mensualidad de la agencia + IA estimada (mensajes × costo por conversación de
     `packages/llm/src/pricing.ts`) + Cloudflare.
   - ROI mensual y meses para recuperar la instalación.
3. Si existe una skill de ROI del dueño (p. ej. su calculadora de retorno), úsala y mantén sus formatos.
4. Entrega: tabla de escenarios, la frase de venta ("se paga en N semanas en el escenario conservador") y la
   lista de supuestos. Guarda en `.yunque/propuestas/roi-<cliente>.md`.
5. Nunca prometas resultados garantizados: son estimaciones con los datos que dio el prospecto.
