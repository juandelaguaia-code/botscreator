---

name: demo
description: Modo agencia — arma un bot de demostración para un prospecto con la información pública de su negocio (su web) y deja el link del chat para mandárselo o mostrarlo en la reunión. Úsala con "haz una demo", "bot de muestra para el prospecto", "quiero mostrarle cómo quedaría".
---

# Demo para un prospecto

1. Pide el nombre del negocio y su web (o redes). No uses datos que no sean públicos.
2. Usa un bot de demos separado (nunca el de un cliente real): si no existe, créalo con la skill
   `cliente-nuevo` con el nombre `yunque-demo` y sin canales de mensajería.
3. Carga el negocio del prospecto en ese bot:
   - Perfil con lo que encuentres publicado (nombre, a qué se dedica, servicios y precios publicados, horario,
     ubicación). Lo que no esté publicado, déjalo vacío: el Blindaje hará que el bot diga "lo confirmo".
   - `YUNQUE_URL=<url-demo> YUNQUE_PASSWORD=<…> pnpm yunque conocimiento:importar <url>` para 2–4 páginas clave.
   - Tono acorde a su marca y botones encendidos.
4. Prueba 5 preguntas típicas de su giro (`pnpm yunque probar …`) y ajusta lo que falle.
5. Entrega el snippet del chat web apuntando al bot demo y una página de prueba simple si la pide, más 3 preguntas
   sugeridas para que el prospecto pruebe. Recuérdale borrar o cambiar la demo cuando cierre o pierda la venta.
