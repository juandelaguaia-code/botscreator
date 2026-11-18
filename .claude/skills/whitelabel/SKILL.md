---

name: whitelabel
description: Pone el panel con la marca de la agencia o del negocio — nombre, logo, color de acento, estilo (Nimbus, Onyx, Terra), tipografía, textos del login, pestañas ocultas y dominio propio en Cloudflare. Úsala con "marca blanca", "pon mi logo en el panel", "que el panel tenga mi marca", "panel en mi dominio", "white label".
---

# Marca blanca

Todo vive en `settings.branding` y se aplica al guardar, sin volver a desplegar. El dominio propio sí es un
cambio de Cloudflare (y se hace con el sí del dueño).

## 1. Identidad (2–3 preguntas como máximo)

Pregunta nombre del panel, color de la marca (hex o "el de mi logo") y estilo:

| Estilo | Para quién                                |
| ------ | ----------------------------------------- |
| Nimbus | Claro y limpio, el de siempre             |
| Onyx   | Oscuro moderno (tecnología, nocturnos)    |
| Terra  | Cálido editorial (gastronomía, bienestar) |

Tipografías disponibles: las de `BRAND_FONTS` en `packages/core/src/settings.ts` (se cargan de Google Fonts).

Guarda con `pnpm yunque config` → edita solo `settings.branding` → `pnpm yunque config:guardar <archivo>`:

```json
{
  "settings": {
    "branding": {
      "panelName": "Panel Acme",
      "accentColor": "#1f8a5b",
      "style": "terra",
      "font": "Manrope",
      "loginTitle": "Bienvenido a Acme",
      "loginSubtitle": "Entra con tu correo."
    }
  }
}
```

Recuerda leer la configuración completa antes y mandar el objeto `branding` entero (los demás campos se conservan).

## 2. Logo

Lo más simple: panel → Configuración → Marca blanca → **Subir archivo** (PNG, JPG, WEBP o SVG de hasta 1 MB).
Queda guardado en el propio bot (R2, binding `MEDIA`), sin hosting externo. También sirve pegar una URL pública.

## 3. Pestañas

Para esconder secciones a los accesos personales usa `/ocultar-tabs`.

## 4. Dominio propio (opcional)

El dominio debe estar en la misma cuenta de Cloudflare que el Worker. Con el sí del dueño, agrega a
`apps/bot/wrangler.jsonc` (nivel superior, producción):

```jsonc
"routes": [{ "pattern": "panel.tuagencia.com", "custom_domain": true }]
```

Luego `pnpm deploy`. Cloudflare crea el DNS y el certificado solo. Actualiza la variable `PUBLIC_URL` al dominio
nuevo para que los links de invitación, el logo y los webhooks usen esa dirección, y vuelve a registrar los
webhooks de los canales si cambió la URL pública (ver `/conectar-canal`).

## Comprobación

Abre `/admin` en una ventana privada: el login debe mostrar logo, título y colores nuevos. Entra y revisa que el
menú tenga el nombre del panel.
