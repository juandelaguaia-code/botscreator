---

name: cliente-nuevo
description: Modo agencia — monta un bot aislado para un negocio cliente (su propio Worker, base D1 e índice Vectorize, en la cuenta de Cloudflare del cliente o la de la agencia) y lo deja configurado. Úsala con "nuevo cliente", "monta un bot para otro negocio", "bot para mi cliente".
---

# Bot para un cliente nuevo

**Un bot = sus propios recursos.** Nunca reutilices la base, el índice ni el Worker de otro bot: heredaría
sus conversaciones y su configuración.

1. Pregunta (una por mensaje): nombre del negocio cliente · ¿en la cuenta de Cloudflare del cliente o en la tuya? ·
   quién paga la llave de IA · canal principal.
2. Crea una configuración de despliegue propia **junto a la principal** (así las rutas relativas siguen valiendo):
   `cp apps/bot/wrangler.jsonc apps/bot/wrangler.<slug>.jsonc` y cambia `name` (`yunque-<slug>`),
   `database_name` (`yunque_<slug>_db`), `index_name` (`yunque_<slug>_kb`) y `BOT_NAME`.
   Desde `apps/bot`, todo comando de ese cliente lleva `-c wrangler.<slug>.jsonc`
   (`d1 create`, `vectorize create`, `secret put`, `d1 migrations apply DB --remote`, `deploy`).
3. Sigue las fases 2, 4, 5 y 6 de la skill `configurar-bot` con los datos del cliente; usa un
   `.yunque.json` distinto (`YUNQUE_URL` / `YUNQUE_PASSWORD` por comando) para operar ese bot.
4. Corre `cliente-misterioso` antes de entregarlo.
5. Entrega: URL del panel, cómo entrar, qué hace cada pestaña y cómo pedir cambios.
