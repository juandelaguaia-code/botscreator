---

name: cliente-nuevo
description: Modo agencia — monta un bot aislado para un negocio cliente (su propio Worker, base D1 e índice Vectorize, en la cuenta de Cloudflare del cliente o la de la agencia) y lo deja configurado. Úsala con "nuevo cliente", "monta un bot para otro negocio", "bot para mi cliente".
---

# Bot para un cliente nuevo

**Un bot = sus propios recursos.** Nunca reutilices la base, el índice ni el Worker de otro bot: heredaría
sus conversaciones y su configuración.

1. Pregunta (una por mensaje): nombre del negocio cliente · giro · ¿en la cuenta de Cloudflare del cliente o en la
   tuya? · quién paga la llave de IA · cuánto le cobrarás al mes · canal principal.
2. Si va en la cuenta del cliente, pídele que te comparta acceso a su cuenta de Cloudflare y anota su
   _Account ID_ (Cloudflare → Workers & Pages, columna derecha).
3. Registra e instala con el instalador (con el sí del dueño de la agencia antes de `instalar`):
   - `pnpm bot init --nombre "<negocio>" --giro <giro> [--cuenta <account-id>]`
   - `pnpm bot instalar <bot>` → crea base, índice y archivos propios, despliega y pide los secretos.
4. Sigue las fases 2, 4, 5 y 6 de la skill `configurar-bot` con los datos del cliente; para operar ese bot usa
   `YUNQUE_URL` / `YUNQUE_PASSWORD` por comando (tu `.yunque.json` suele apuntar a tu central).
5. Vincúlalo a tu central: `pnpm bot vincular <bot> --mensualidad <monto>`. Genera el token de agencia, lo guarda
   en el bot del cliente y lo agrega a tu portafolio de Modo agencia sin que nadie lo vea.
6. Corre `cliente-misterioso` antes de entregarlo y `pnpm bot doctor <bot>` al final.
7. Entrega: URL del panel, cómo entrar, qué hace cada pestaña y cómo pedir cambios.
