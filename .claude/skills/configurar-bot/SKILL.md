---

name: configurar-bot
description: Instala y deja funcionando un bot de Yunque de principio a fin — entrevista del negocio, cuenta de Cloudflare, base de datos, base de conocimiento, llave de IA, despliegue, canal y prueba real. Úsala cuando digan "configura mi bot", "instala el bot", "monta el chatbot de mi negocio", "despliega el bot" o es la primera vez que abren este repo.
---

# Configurar un bot de Yunque

Tú haces lo técnico; el dueño responde preguntas de negocio y aprueba. **Una pregunta por mensaje.**
Antes de cada paso que cree recursos o despliegue, di en una frase qué vas a hacer y espera su "sí".

## Fase 0 · Mapa (sin correr nada)

Explica en 4 líneas: el bot vive en SU Cloudflare (gratis para empezar), piensa con SU llave de IA
(Claude por defecto), los datos son suyos, y al final se conecta al chat de su web o Telegram.

## Fase 1 · Herramientas

- `node -v` (≥ 22) y `pnpm -v`. Si falta pnpm: `corepack enable pnpm`.
- `pnpm install` en la raíz del repo.

## Fase 2 · El negocio (entrevista, una por mensaje)

Nombre → a qué se dedica → productos/servicios **con precio** (y duración si se agendan) → horario y zona
horaria → ubicación → teléfono/WhatsApp → web o redes → métodos de pago → las 3 preguntas que más le hacen
(con su respuesta) → qué NO debe hacer el bot y cuándo pasarle la conversación → tono (cercano, formal,
divertido) → idioma (es-419, es-ES, en, pt-BR o espejo).

Con las respuestas arma `perfil.json` con la forma `{ "profile": { ... } }` siguiendo
`businessProfileSchema` en `packages/core/src/business.ts`. No inventes datos: lo que no sepas, déjalo vacío.

## Fase 3 · Cloudflare (en `apps/bot`)

1. `npx wrangler login` (abre el navegador; el dueño entra con su cuenta).
2. Nombres **únicos por bot** (nunca reutilices los de otro bot): cambia `name`, `database_name`,
   `index_name` y `BOT_NAME` en `wrangler.jsonc`.
3. `npx wrangler d1 create <database_name>` → copia el `database_id` a `wrangler.jsonc`.
4. `npx wrangler vectorize create <index_name> --dimensions=1024 --metric=cosine`.
5. `pnpm db:migrate:remote`.

## Fase 4 · Secretos (el dueño los escribe en SU terminal, no en el chat)

- `npx wrangler secret put DASHBOARD_PASSWORD`
- `npx wrangler secret put ANTHROPIC_API_KEY` (o la llave de OpenAI/xAI/Gemini; ver la skill `superpoderes`
  para elegir proveedor). Si aun así pega una llave en el chat, avísale que queda en el historial, guárdala
  con `wrangler secret put` pasándola por stdin y nunca la repitas.

## Fase 5 · Desplegar y cargar el negocio

1. Desde la raíz: `pnpm deploy`. Anota la URL `https://<name>.<cuenta>.workers.dev`.
2. Pídele que cree `apps/bot/.yunque.json` con `{ "url": "<URL>", "password": "<su contraseña>" }`
   (está en `.gitignore`). Así operas con el CLI sin ver la contraseña.
3. `pnpm yunque config:guardar perfil.json` y revisa con `pnpm yunque prompt`.
4. Si tiene web: `pnpm yunque conocimiento:importar <url>` para sus páginas clave (ver skill `conocimiento`).

## Fase 6 · Canal y prueba

- Ofrece primero el **chat web** (el más fácil): el snippet está en el Resumen del panel (`/admin`).
- Telegram: skill `conectar-canal`.
- Prueba real: `pnpm yunque probar "¿a qué hora abren?"` y luego un mensaje desde el canal conectado.
- Cierra mostrando el panel `/admin` y qué hace cada pestaña.

## Reglas

- Nunca hagas commit, push ni deploy sin su sí. Nunca imprimas secretos.
- Si algo falla, explica en simple qué pasó y el siguiente paso; no lo dejes colgado.
