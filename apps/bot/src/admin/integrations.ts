import { campaignInputSchema, type GalleryItemDto } from "@yunque/core";
import { Hono } from "hono";
import { runAutomation } from "../automation/runner.js";
import type { GalleryRecord } from "../integrations/store.js";
import { newId } from "../lib/crypto.js";
import type { AppEnv } from "../types.js";
import { readJson } from "./http.js";

const MAX_UPLOAD = 15 * 1024 * 1024;
const KINDS: Record<string, GalleryItemDto["kind"]> = {
  image: "image",
  video: "video",
  audio: "audio",
};

function toGalleryDto(item: GalleryRecord, base: string): GalleryItemDto {
  const { objectKey, ...rest } = item;
  return { ...rest, url: `${base}/media/${objectKey}` };
}

/** Agenda, cobros, Galería y campañas. */
export const integrationsApi = new Hono<AppEnv>();

integrationsApi.get("/appointments", async (c) =>
  c.json({
    appointments: await c
      .get("services")
      .integrations.listAppointments(Date.now() - 7 * 86_400_000),
  }),
);

integrationsApi.get("/payments", async (c) =>
  c.json({ payments: await c.get("services").integrations.listPayments() }),
);

// ---------- Galería ----------

integrationsApi.get("/gallery", async (c) => {
  const base = c.env.PUBLIC_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
  const items = await c.get("services").integrations.listGallery();
  return c.json({ items: items.map((i) => toGalleryDto(i, base)), storage: Boolean(c.env.MEDIA) });
});

integrationsApi.post("/gallery", async (c) => {
  if (!c.env.MEDIA)
    return c.json({ error: "Falta el bucket R2 (binding MEDIA) para guardar archivos." }, 503);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const name = String(form?.get("name") ?? "").trim();
  const description = String(form?.get("description") ?? "").trim();
  if (!(file instanceof File) || !name || !description) {
    return c.json({ error: "Sube un archivo con nombre y cuándo usarlo." }, 400);
  }
  if (file.size > MAX_UPLOAD) return c.json({ error: "El archivo pesa más de 15 MB." }, 400);
  const kind =
    KINDS[file.type.split("/")[0] ?? ""] ?? (file.type === "application/pdf" ? "document" : null);
  if (!kind) return c.json({ error: "Formato no soportado (imagen, video, audio o PDF)." }, 400);

  const extension = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
    : "";
  const objectKey = `${newId("g")}${extension.replace(/[^.a-z0-9]/g, "")}`;
  await c.env.MEDIA.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  try {
    const item = await c.get("services").integrations.saveGalleryItem({
      name: name.slice(0, 120),
      description: description.slice(0, 300),
      kind,
      contentType: file.type,
      objectKey,
      size: file.size,
    });
    const base = c.env.PUBLIC_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
    return c.json({ item: toGalleryDto(item, base) }, 201);
  } catch {
    await c.env.MEDIA.delete(objectKey);
    return c.json({ error: "Ya existe un archivo con ese nombre." }, 409);
  }
});

integrationsApi.delete("/gallery/:id", async (c) => {
  const item = await c.get("services").integrations.deleteGalleryItem(c.req.param("id"));
  if (!item) return c.json({ error: "Archivo no encontrado" }, 404);
  await c.env.MEDIA?.delete(item.objectKey);
  return c.json({ ok: true });
});

// ---------- campañas ----------

integrationsApi.get("/campaigns", async (c) =>
  c.json({ campaigns: await c.get("services").integrations.listCampaigns() }),
);

integrationsApi.post("/campaigns", async (c) => {
  const input = await readJson(c.req.raw, campaignInputSchema);
  if (!input) return c.json({ error: "Nombre, mensaje y al menos un canal." }, 400);
  const id = await c.get("services").integrations.createCampaign(input);
  return c.json({ id }, 201);
});

/** Arranca el envío: el primer lote sale ahora y el cron continúa cada 15 minutos. */
integrationsApi.post("/campaigns/:id/send", async (c) => {
  const { integrations } = c.get("services");
  const campaign = await integrations.getCampaign(c.req.param("id"));
  if (!campaign) return c.json({ error: "Campaña no encontrada" }, 404);
  if (campaign.status === "done") return c.json({ error: "La campaña ya terminó" }, 409);
  await integrations.setCampaignStatus(campaign.id, "sending");
  const report = await runAutomation(c.get("services"));
  return c.json({ ok: true, sent: report.campaignSent });
});
