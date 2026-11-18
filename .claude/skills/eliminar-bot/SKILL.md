---

name: eliminar-bot
description: Da de baja un bot de forma segura — respaldo de la base, borrado del Worker, la base, el índice y los archivos en Cloudflare, y salida del portafolio de la agencia. Úsala con "elimina el bot", "da de baja al cliente", "borra este bot", "ya no lo necesito".
---

# Eliminar un bot

Esto **no se puede deshacer** en Cloudflare: conversaciones, clientes y configuración desaparecen. El respaldo
local es lo único que queda.

1. Confirma cuál: `pnpm bot lista`. Repite al dueño el nombre del negocio y su URL.
2. Pregunta si quiere exportar antes sus leads y conversaciones en CSV (`/exportar`).
3. Explica en una frase qué se borra (Worker, base D1, índice Vectorize, bucket R2) y que queda un respaldo `.sql`
   en `.yunque/respaldos/`. Espera un "sí" explícito.
4. Pídele que lo corra él en su terminal, donde escribirá el identificador para confirmar:
   `pnpm bot eliminar <bot>`. (Sin terminal interactiva el comando exige `--confirmar <bot>`; úsalo solo si el
   dueño lo pidió con esas palabras.)
5. Si algún recurso no se pudo borrar (p. ej. el bucket con archivos), el comando dice dónde hacerlo a mano y
   conserva los datos locales para reintentar.
6. Si el bot estaba vinculado a una central, el comando lo saca del portafolio; si no pudo, quítalo en Modo agencia.

Nunca uses `--sin-respaldo` salvo pedido explícito del dueño.
