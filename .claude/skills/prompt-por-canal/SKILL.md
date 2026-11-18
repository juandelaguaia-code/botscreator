---

name: prompt-por-canal
description: Da al bot una personalidad distinta por canal (más formal en WhatsApp, más casual en Instagram, firma en Messenger…) sin tocar los demás canales. Úsala con "que suene distinto en WhatsApp", "más casual en Instagram", "instrucciones por canal".
---

# Prompt por canal

1. Pregunta en qué canal quiere el cambio y qué debe ser distinto ahí (una pregunta a la vez).
2. Redacta 1–4 líneas concretas solo de estilo o forma para ese canal (tratamiento, largo, emojis, firma).
   Nada de datos del negocio ni reglas de seguridad: eso es igual en todos los canales.
3. Muestra el texto, ajusta y guárdalo en `profile.channelInstructions.<canal>` (skill `prompt`, guardado
   validado con `pnpm yunque config:guardar`).
4. Comprueba con `pnpm yunque prompt <canal>`: debe aparecer la sección "Instrucciones para este canal" solo en ese
   canal.
