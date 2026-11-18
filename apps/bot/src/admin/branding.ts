import { Hono } from "hono";
import { SETTINGS_KEYS } from "../engine/config.js";
import { newId } from "../lib/crypto.js";
import { TeamStore } from "../store/team.js";
import type { AppEnv } from "../types.js";

const MAX_LOGO = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Marca blanca: el logo se guarda en el propio bot (R2), sin hosting externo. */
export const brandingApi = new Hono<AppEnv>();

brandingApi.post("/branding/logo", async (c) => {
  if (!c.env.MEDIA)
    return c.json(
      { error: "Falta el bucket R2 (binding MEDIA). También puedes pegar la URL del logo." },
      503,
    );
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "Sube una imagen." }, 400);
  if (!LOGO_TYPES.includes(file.type))
    return c.json({ error: "El logo debe ser PNG, JPG, WEBP o SVG." }, 400);
  if (file.size > MAX_LOGO) return c.json({ error: "El logo pesa más de 1 MB." }, 400);

  const ext =
    { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg" }[
      file.type
    ] ?? "";
  const key = `branding-${newId("logo")}${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const { store, config } = c.get("services");
  const { settings } = await config();
  const previous = settings.branding.logoUrl.match(/\/media\/(branding-[\w.-]+)$/)?.[1];
  const base = c.env.PUBLIC_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
  const logoUrl = `${base}/media/${key}`;
  await store.setSetting(SETTINGS_KEYS.settings, {
    ...settings,
    branding: { ...settings.branding, logoUrl },
  });
  if (previous) await c.env.MEDIA.delete(previous);
  await new TeamStore(c.env.DB).audit(c.get("actor") ?? null, "Cambió el logo del panel");
  return c.json({ logoUrl });
});
