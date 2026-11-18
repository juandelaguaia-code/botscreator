---

name: superpoderes
description: Enciende, apaga y ajusta los superpoderes del bot (Blindaje anti-invento, handoff, botones, voz, idioma, cerebro de IA) y explica cuáles están disponibles y cuáles vienen en próximas fases. Úsala con "activa los superpoderes", "configura el blindaje", "prende los botones", "cambia el modelo", "qué superpoderes tengo".
---

# Superpoderes

Catálogo completo con estado y números: `docs/05-superpoderes.md`. Lee la fila antes de prometer algo.

## 1. Estado actual

`pnpm yunque config` → mira `settings`. Resume en una tabla: superpoder · estado · ajuste.

## 2. Disponibles hoy y su ajuste (en `settings`)

| Superpoder                             | Campo                             | Valores                                                           |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Blindaje · verificador pre-envío       | `verifierEnabled`                 | true (recomendado)                                                |
| Blindaje · umbral de confianza         | `kbMinScore`                      | `null` = automático (0.7 con bge-m3); 0.1–0.99                    |
| Blindaje · pasajes por mensaje         | `kbTopK`                          | 1–10 (5)                                                          |
| Handoff · minutos que el bot se aparta | `takeoverMinutes`                 | 5–1440 (60)                                                       |
| Botones tocables                       | `buttonsEnabled`                  | false por defecto: **pregunta antes de prender**                  |
| Cerebro                                | `provider`, `modelMode`, `models` | anthropic/openai/xai/gemini · economico/equilibrado/maximo        |
| Voz de marca                           | `profile.tone`                    | cercano/formal/divertido (retrato a medida: skill `voz-de-marca`) |
| Multi-idioma                           | `profile.language`                | es-419, es-ES, en, pt-BR, espejo                                  |
| Anti-abuso                             | `rateLimitPer10Min`               | 5–500 (30)                                                        |

## 3. Cambiar

1. Pregunta qué quiere lograr (una pregunta), propone el ajuste y espera su sí.
2. Archivo `{ "settings": { ...settings actuales con el cambio... } }` → `pnpm yunque config:guardar <archivo>`.
3. Demuestra el efecto con `pnpm yunque probar "..."`.

## Guías rápidas

- **El bot junta todo en un mensaje o se salta pasos** → `modelMode: "maximo"`.
- **Quiero gastar menos** → `modelMode: "economico"`; muestra el costo del mes con `pnpm yunque resumen`.
- **Frena demasiadas respuestas** → revisa `pnpm yunque huecos` (fuente verifier): casi siempre falta el dato
  en el perfil o en conocimiento; agrégalo antes de bajar el umbral.
- **Proveedor sin llave** → el panel lo marca "falta la llave": guía `wrangler secret put <PROVEEDOR>_API_KEY`.

## Próximas fases (no prometer como activos)

Vigilante con IA, Cazador de ventas, Oído y vista, Reportes automáticos, Encuestas, Recupera no-shows,
Pide reseñas, Cobros por WhatsApp y Galería: ver fase y alcance en `docs/03-roadmap.md`.
