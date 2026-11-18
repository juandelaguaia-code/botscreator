import {
  type BusinessProfile,
  businessProfileSchema,
  GIRO_IDS,
  GIROS,
  type GiroId,
  type PromptVersionDto,
} from "@yunque/core";
import { Hono } from "hono";
import { z } from "zod";
import { SETTINGS_KEYS } from "../engine/config.js";
import { newId } from "../lib/crypto.js";
import type { Store } from "../store/types.js";
import type { AppEnv } from "../types.js";
import { readJson } from "./http.js";

const MAX_VERSIONS = 50;

/** Guarda el perfil actual como versión (antes de cada cambio) y recorta las más viejas. */
export async function snapshotProfile(
  db: D1Database,
  store: Store,
  label: string,
  author: string | null,
): Promise<void> {
  const current = await store.getSetting<BusinessProfile>(SETTINGS_KEYS.profile);
  if (!current) return;
  await db.batch([
    db
      .prepare(
        "INSERT INTO prompt_versions (id, label, profile, author, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(newId("pv"), label.slice(0, 120), JSON.stringify(current), author, Date.now()),
    db
      .prepare(
        "DELETE FROM prompt_versions WHERE id NOT IN (SELECT id FROM prompt_versions ORDER BY created_at DESC LIMIT ?)",
      )
      .bind(MAX_VERSIONS),
  ]);
}

export const promptApi = new Hono<AppEnv>();

promptApi.get("/prompt/versions", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM prompt_versions ORDER BY created_at DESC LIMIT ?",
  )
    .bind(MAX_VERSIONS)
    .all<{
      id: string;
      label: string;
      profile: string;
      author: string | null;
      created_at: number;
    }>();
  const versions: PromptVersionDto[] = results.map((r) => {
    const p = JSON.parse(r.profile) as Partial<BusinessProfile>;
    return {
      id: r.id,
      label: r.label,
      author: r.author,
      createdAt: Number(r.created_at),
      preview: {
        giro: p.giro ?? "general",
        tone: p.tone ?? "cercano",
        instructionsChars: p.instructions?.length ?? 0,
        faq: p.faq?.length ?? 0,
        offerings: p.offerings?.length ?? 0,
      },
    };
  });
  return c.json({ versions });
});

promptApi.post("/prompt/versions", async (c) => {
  const input = await readJson(c.req.raw, z.object({ label: z.string().trim().min(1).max(120) }));
  if (!input) return c.json({ error: "Ponle un nombre a la versión." }, 400);
  await snapshotProfile(
    c.env.DB,
    c.get("services").store,
    input.label,
    c.get("actor")?.name ?? null,
  );
  return c.json({ ok: true }, 201);
});

promptApi.post("/prompt/versions/:id/restore", async (c) => {
  const row = await c.env.DB.prepare("SELECT profile FROM prompt_versions WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ profile: string }>();
  if (!row) return c.json({ error: "Versión no encontrada" }, 404);
  const parsed = businessProfileSchema.safeParse(JSON.parse(row.profile));
  if (!parsed.success)
    return c.json({ error: "Esa versión ya no es compatible con la configuración actual." }, 422);
  const { store } = c.get("services");
  await snapshotProfile(c.env.DB, store, "Antes de restaurar", c.get("actor")?.name ?? null);
  await store.setSetting(SETTINGS_KEYS.profile, parsed.data);
  return c.json({ profile: parsed.data });
});

// ---------- giros ----------

promptApi.get("/giros", (c) =>
  c.json({
    giros: GIRO_IDS.map((id) => {
      const g = GIROS[id];
      return {
        id,
        name: g.name,
        pitch: g.pitch,
        bookingLabel: g.bookingLabel,
        tone: g.tone,
        recommended: g.recommended,
        suggestedQuestions: g.suggestedQuestions,
        suggestedOfferings: g.suggestedOfferings,
      };
    }),
  }),
);

/**
 * Cambia el giro del bot (re-nichar). Agrega los servicios típicos solo si el negocio todavía no
 * tiene ninguno; nunca pisa lo que el dueño ya escribió.
 */
promptApi.post("/giro/apply", async (c) => {
  const input = await readJson(c.req.raw, z.object({ giro: z.enum(GIRO_IDS) }));
  if (!input) return c.json({ error: "Giro inválido." }, 400);
  const { store, config } = c.get("services");
  const { profile } = await config();
  const giro = GIROS[input.giro as GiroId];
  await snapshotProfile(
    c.env.DB,
    store,
    `Antes de cambiar a ${giro.name}`,
    c.get("actor")?.name ?? null,
  );
  const next = businessProfileSchema.parse({
    ...profile,
    giro: giro.id,
    offerings: profile.offerings.length
      ? profile.offerings
      : giro.suggestedOfferings.map((name) => ({ name })),
  });
  await store.setSetting(SETTINGS_KEYS.profile, next);
  const answered = new Set(next.faq.map((f) => f.question.toLowerCase()));
  return c.json({
    profile: next,
    pendingQuestions: giro.suggestedQuestions.filter((q) => !answered.has(q.toLowerCase())),
  });
});
