# ADR 0003 · Interfaz neutral de proveedores de IA

**Estado:** aceptada · 2026-11-17

## Decisión

`LlmProvider.generate()` recibe sistema por bloques (estable / volátil), mensajes con partes
(texto, imagen, llamada a herramienta, resultado) y herramientas en JSON Schema. Devuelve texto,
llamadas a herramientas, motivo de parada y uso de tokens.

- **Anthropic**: SDK oficial `@anthropic-ai/sdk`, caché de prompt en el bloque estable, esfuerzo
  bajo/medio para chat, herramientas `strict`, _fallback_ del servidor ante rechazos.
- **OpenAI, Grok (xAI), Gemini**: un adaptador sobre la API de Chat Completions compatible.
- **Fake**: guionado, para tests y desarrollo local sin llaves.

## Consecuencias

El motor no sabe qué proveedor usa. Los costos se calculan con una tabla de precios por modelo
(`packages/llm/src/pricing.ts`) que se actualiza a mano.
