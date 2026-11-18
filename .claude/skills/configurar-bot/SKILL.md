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

## Fase 3 · Cloudflare (con el instalador `pnpm bot`)

1. `pnpm bot doctor` revisa Node, dependencias y la sesión de Cloudflare. Si falta la sesión, el dueño corre
   `pnpm --filter @yunque/bot exec wrangler login` (abre el navegador y entra con su cuenta).
2. Registra el bot con lo de la entrevista (nada de Cloudflare todavía):
   `pnpm bot init --nombre "<negocio>" --giro <giro> --idioma <idioma> --moneda "<símbolo>" --zona <IANA>`.
   Los nombres de Worker, base, índice y bucket salen solos y son **únicos por bot**.
3. Con su sí: `pnpm bot instalar <bot>` crea la base D1, el índice Vectorize y el bucket R2, aplica las
   migraciones y despliega. Es seguro repetirlo: reutiliza lo que ya existe. Anota la URL que imprime.

## Fase 4 · Secretos (el dueño los escribe en SU terminal, no en el chat)

`instalar` los pide al final si la terminal es interactiva. Si los dejó para después:

- `pnpm bot secreto <bot> DASHBOARD_PASSWORD`
- `pnpm bot secreto <bot> ANTHROPIC_API_KEY` (o la llave de OpenAI/xAI/Gemini; ver la skill `superpoderes`
  para elegir proveedor). Si aun así pega una llave en el chat, avísale que queda en el historial y pídele que
  la cambie en su proveedor; nunca la repitas.

Cierra la fase con `pnpm bot doctor <bot>`: todo en ✓ salvo los opcionales.

## Fase 5 · Cargar el negocio

1. Pídele que cree `apps/bot/.yunque.json` con `{ "url": "<URL>", "password": "<su contraseña>" }`
   (está en `.gitignore`). Así operas con el CLI sin ver la contraseña.
2. `pnpm yunque config:guardar perfil.json` y revisa con `pnpm yunque prompt`.
3. Si tiene web: `pnpm yunque conocimiento:importar <url>` para sus páginas clave (ver skill `conocimiento`).

## Fase 6 · Canal y prueba

- Ofrece primero el **chat web** (el más fácil): el snippet está en el Resumen del panel (`/admin`).
- Telegram: skill `conectar-canal`.
- Prueba real: `pnpm yunque probar "¿a qué hora abren?"` y luego un mensaje desde el canal conectado.
- Cierra mostrando el panel `/admin` y qué hace cada pestaña.

## Reglas

- Nunca hagas commit, push ni deploy sin su sí. Nunca imprimas secretos.
- Si algo falla, explica en simple qué pasó y el siguiente paso; no lo dejes colgado.
