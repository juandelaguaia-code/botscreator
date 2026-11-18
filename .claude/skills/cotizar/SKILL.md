---

name: cotizar
description: Modo agencia — arma el precio de un bot para un prospecto (instalación, mensualidad y extras) con costos reales y nunca por debajo de un piso. Úsala con "cotiza un bot", "¿cuánto le cobro?", "precio para este cliente".
---

# Cotizar un bot

1. Pregunta (una por mensaje): giro y tamaño del negocio · canales · volumen aproximado de mensajes al mes ·
   integraciones que pide · si la agencia da mantenimiento mensual · moneda.
2. **Costos reales mensuales** (muestra el cálculo): Cloudflare (gratis hasta cierto volumen; ~US$5 con tráfico),
   IA (mensajes × tokens promedio × precio del modelo; usa `packages/llm/src/pricing.ts` como referencia),
   canal (tarifas de Meta/Twilio si aplica), horas de mantenimiento.
3. Propón 3 opciones (básica · recomendada · completa): instalación única + mensualidad + qué incluye cada una.
   Margen mínimo: la mensualidad debe cubrir al menos 3× el costo mensual real.
4. Si el dueño tiene una skill de ROI (p. ej. calculadora de retorno), úsala para justificar el precio.
5. Entrega una tabla clara y deja anotadas las supuestos (volumen, modelo) para la propuesta (skill `propuesta`).
