---

name: voz-de-marca
description: Ajusta cómo suena el bot — presets (cercano, formal, divertido) o un retrato de voz a medida a partir de la web y mensajes reales del negocio — sin tocar nunca los frenos de seguridad. Úsala con "que suene como yo", "más formal", "más cercano", "el bot suena a robot".
---

# Voz de marca

1. **Preset o a medida** (una pregunta). Preset → `profile.tone` y listo (skill `superpoderes`).
2. **Retrato a medida**: pide su web o redes y 5–10 mensajes reales que el dueño haya escrito a clientes.
   Extrae: tuteo o usted · largo típico de frase · energía · emojis (cuáles y cada cuánto) · muletillas ·
   cómo saluda y cómo cierra · palabras que nunca usaría.
3. Redacta un bloque **"Estilo de escritura"** de 6–10 líneas, concreto y con 2 ejemplos cortos de antes/después.
   Solo estilo: nada de precios, promesas ni reglas de escalamiento.
4. Muéstralo, ajusta con su feedback y agrégalo al inicio de `profile.instructions` (skill `prompt`).
5. Prueba 3 mensajes típicos con `pnpm yunque probar` y compara el tono.

La voz cambia **cómo** se dice, nunca **qué** se puede prometer.
