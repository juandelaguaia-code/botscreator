import {
  businessProfileSchema,
  gapResolveInputSchema,
  htmlToText,
  type KbDocumentDetailDto,
  type KbDocumentDto,
  type KbSearchResultDto,
  type KnowledgeGapDto,
  kbDocumentInputSchema,
  kbImportUrlSchema,
  kbSearchInputSchema,
} from "@yunque/core";
import { Hono } from "hono";
import { SETTINGS_KEYS } from "../engine/config.js";
import type { GapRecord, KbDocumentRecord } from "../knowledge/store.js";
import type { AppEnv } from "../types.js";
import { readJson } from "./http.js";

const MAX_IMPORT_BYTES = 2_000_000;
const MAX_DOCUMENT_CHARS = 100_000;

function toDocumentDto(d: KbDocumentRecord, embedderId: string): KbDocumentDto {
  return {
    id: d.id,
    title: d.title,
    source: d.source,
    sourceUrl: d.sourceUrl,
    chunkCount: d.chunkCount,
    chars: d.content.length,
    status: d.status,
    error: d.error,
    stale: d.status === "ready" && d.embeddingModel !== embedderId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function toGapDto(g: GapRecord): KnowledgeGapDto {
  return {
    id: g.id,
    question: g.question,
    source: g.source,
    conversationId: g.conversationId,
    hits: g.hits,
    status: g.status,
    resolution: g.resolution,
    firstSeenAt: g.firstSeenAt,
    lastSeenAt: g.lastSeenAt,
  };
}

export const knowledgeApi = new Hono<AppEnv>();

// ---------- documentos ----------

knowledgeApi.get("/kb", async (c) => {
  const { knowledge } = c.get("services");
  const docs = await knowledge.listDocuments();
  return c.json({
    engine: knowledge.engineInfo(),
    documents: docs.map((d) => toDocumentDto(d, knowledge.embedderId)),
  });
});

knowledgeApi.post("/kb/documents", async (c) => {
  const input = await readJson(c.req.raw, kbDocumentInputSchema);
  if (!input)
    return c.json({ error: "Escribe un título y el contenido (máx. 100.000 caracteres)." }, 400);
  const { knowledge } = c.get("services");
  const doc = await knowledge.addDocument({ ...input, source: "manual" });
  return c.json({ document: toDocumentDto(doc, knowledge.embedderId) }, 201);
});

knowledgeApi.get("/kb/documents/:id", async (c) => {
  const { knowledge } = c.get("services");
  const doc = await knowledge.getDocument(c.req.param("id"));
  if (!doc) return c.json({ error: "Documento no encontrado" }, 404);
  const dto: KbDocumentDetailDto = {
    ...toDocumentDto(doc, knowledge.embedderId),
    content: doc.content,
  };
  return c.json(dto);
});

knowledgeApi.put("/kb/documents/:id", async (c) => {
  const input = await readJson(c.req.raw, kbDocumentInputSchema);
  if (!input) return c.json({ error: "Escribe un título y el contenido." }, 400);
  const { knowledge } = c.get("services");
  const doc = await knowledge.updateDocument(c.req.param("id"), input.title, input.content);
  if (!doc) return c.json({ error: "Documento no encontrado" }, 404);
  return c.json({ document: toDocumentDto(doc, knowledge.embedderId) });
});

knowledgeApi.delete("/kb/documents/:id", async (c) => {
  const ok = await c.get("services").knowledge.removeDocument(c.req.param("id"));
  if (!ok) return c.json({ error: "Documento no encontrado" }, 404);
  return c.json({ ok: true });
});

/** Importa el texto de una página web del negocio como documento. */
knowledgeApi.post("/kb/import-url", async (c) => {
  const input = await readJson(c.req.raw, kbImportUrlSchema);
  if (!input) return c.json({ error: "Escribe una dirección http(s) válida." }, 400);

  let html: string;
  try {
    const res = await fetch(input.url, {
      headers: {
        "user-agent": "YunqueBot/0.1 (importador de base de conocimiento)",
        accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return c.json({ error: `La página respondió ${res.status}.` }, 422);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
      return c.json({ error: "Esa dirección no es una página de texto." }, 422);
    }
    html = await res.text();
    if (html.length > MAX_IMPORT_BYTES) html = html.slice(0, MAX_IMPORT_BYTES);
  } catch {
    return c.json({ error: "No se pudo descargar la página (revisa la dirección)." }, 422);
  }

  const { title, text } = htmlToText(html);
  if (text.length < 50)
    return c.json({ error: "La página no tiene texto legible para importar." }, 422);

  const { knowledge } = c.get("services");
  const doc = await knowledge.addDocument({
    title: (title || new URL(input.url).hostname).slice(0, 200),
    content: text.slice(0, MAX_DOCUMENT_CHARS),
    source: "url",
    sourceUrl: input.url,
  });
  return c.json({ document: toDocumentDto(doc, knowledge.embedderId) }, 201);
});

knowledgeApi.post("/kb/search", async (c) => {
  const input = await readJson(c.req.raw, kbSearchInputSchema);
  if (!input) return c.json({ error: "Escribe una pregunta." }, 400);
  const { knowledge, config } = c.get("services");
  const { settings } = await config();
  const found = await knowledge.search(input.query, {
    topK: settings.kbTopK,
    minScore: settings.kbMinScore,
  });
  const dto: KbSearchResultDto = {
    minScore: found.minScore,
    results: found.hits.map((h) => ({
      documentId: h.documentId,
      title: h.title,
      text: h.text,
      score: Math.round(h.score * 1000) / 1000,
      passes: h.passes,
    })),
  };
  return c.json(dto);
});

knowledgeApi.post("/kb/reindex", async (c) =>
  c.json(await c.get("services").knowledge.reindexAll()),
);

// ---------- radar de huecos ----------

knowledgeApi.get("/gaps", async (c) => {
  const status = c.req.query("status");
  const filter = status === "resolved" || status === "ignored" ? status : "open";
  const days = Math.min(365, Math.max(1, Number(c.req.query("days") ?? 30) || 30));
  const gaps = await c.get("services").knowledge.listGaps(filter, days);
  return c.json({ gaps: gaps.map(toGapDto) });
});

/** Tapa un hueco. Con respuesta, se agrega a las preguntas frecuentes del negocio. */
knowledgeApi.post("/gaps/:id/resolve", async (c) => {
  const input = await readJson(c.req.raw, gapResolveInputSchema);
  if (!input) return c.json({ error: "Respuesta inválida." }, 400);
  const { knowledge, store, config } = c.get("services");
  const gap = await knowledge.getGap(c.req.param("id"));
  if (gap?.status !== "open") return c.json({ error: "El hueco no existe o ya se cerró" }, 404);

  if (input.answer) {
    const { profile } = await config();
    const updated = businessProfileSchema.safeParse({
      ...profile,
      faq: [...profile.faq, { question: gap.question.slice(0, 300), answer: input.answer }],
    });
    if (!updated.success)
      return c.json(
        { error: "No se pudo agregar a las preguntas frecuentes (¿hay demasiadas?)." },
        400,
      );
    await store.setSetting(SETTINGS_KEYS.profile, updated.data);
  }
  await knowledge.closeGap(gap.id, "resolved", input.answer ?? null);
  return c.json({ ok: true });
});

knowledgeApi.post("/gaps/:id/ignore", async (c) => {
  const ok = await c.get("services").knowledge.closeGap(c.req.param("id"), "ignored", null);
  if (!ok) return c.json({ error: "El hueco no existe o ya se cerró" }, 404);
  return c.json({ ok: true });
});
