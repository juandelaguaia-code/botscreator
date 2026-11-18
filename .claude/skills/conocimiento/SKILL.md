---

name: conocimiento
description: Arma y mantiene la base de conocimiento del bot — importa páginas de la web del negocio, carga documentos (políticas, catálogo, preguntas largas), prueba la búsqueda y ajusta el umbral. Úsala con "clona mi web", "carga mi catálogo", "que el bot sepa mis políticas", "el bot no encuentra X".
---

# Base de conocimiento

## Cuándo usarla

Lo **corto y estable** (horario, precios principales, pagos, 10–20 FAQ) va en el perfil. Lo **largo o
detallado** (políticas, catálogo, menú completo, procesos) va aquí. El bot recibe por mensaje solo los
pasajes que superan el umbral de confianza.

## Flujo

1. Estado: `pnpm yunque conocimiento` (documentos, motor y umbral recomendado). Si hay `stale: true`,
   `pnpm yunque conocimiento:reindexar`.
2. **Desde su web**: pídele las 3–8 páginas clave (servicios, precios, FAQ, políticas, envíos).
   `pnpm yunque conocimiento:importar <url>` por cada una. Revisa el resultado; si la página traía mucho
   ruido, mejor arma un documento limpio.
3. **Documento propio**: escribe un `.md` claro, **un tema por párrafo**, títulos explícitos, sin tablas
   enormes. `pnpm yunque conocimiento:agregar "Políticas de cancelación" politicas.md`.
4. **Prueba**: 5 preguntas reales como las haría un cliente:
   `pnpm yunque conocimiento:buscar "¿puedo cambiar mi cita?"`. Cada resultado trae `score` y `passes`.
   - Lo correcto no pasa el umbral → reescribe el pasaje con las palabras del cliente o divide el documento.
   - Pasa algo incorrecto → el documento mezcla temas; sepáralo.
5. Ajuste fino (solo si hace falta): `settings.kbMinScore` (skill `superpoderes`).

## Reglas

- Nada de datos de clientes ni secretos en documentos.
- Máximo 100.000 caracteres por documento; si es más, divídelo por tema.
- Tras cambios grandes, corre `pnpm yunque probar` con 2–3 preguntas para confirmar.
