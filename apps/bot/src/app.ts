import { webChatInputSchema } from "@yunque/core";
import { Hono } from "hono";
import { adminApi } from "./admin/routes.js";
import { webhooks } from "./channels/webhooks.js";
import { WIDGET_JS } from "./channels/widget.js";
import { APP_VERSION } from "./env.js";
import { createServices, type Services } from "./services.js";
import type { AppEnv } from "./types.js";

export interface CreateAppOptions {
  /** Inyecta servicios (tests). En producción se construyen desde los bindings. */
  services?: (env: AppEnv["Bindings"]) => Services;
}

export function createApp(options: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const build = options.services ?? createServices;

  app.use("*", async (c, next) => {
    c.set("services", build(c.env));
    await next();
  });

  app.onError((error, c) => {
    console.error(
      JSON.stringify({ message: "unhandled_error", path: c.req.path, detail: error.message }),
    );
    return c.json({ error: "Error interno. Revisa los logs del Worker." }, 500);
  });

  app.get("/", (c) => c.redirect("/admin/"));
  app.get("/healthz", (c) => c.json({ ok: true, version: APP_VERSION }));

  // ---------- canal web (widget) ----------

  app.get("/widget.js", (c) =>
    c.body(WIDGET_JS, 200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    }),
  );

  app.use("/api/web/*", async (c, next) => {
    const origin = c.req.header("origin");
    const { settings } = await c.get("services").config();
    const allowed = settings.widgetAllowedOrigins;
    const allowOrigin = !origin
      ? null
      : allowed.length === 0 || allowed.includes(origin)
        ? origin
        : null;
    if (origin && !allowOrigin) return c.json({ error: "Origen no permitido" }, 403);
    if (allowOrigin) {
      c.header("access-control-allow-origin", allowOrigin);
      c.header("vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      c.header("access-control-allow-methods", "GET, POST, OPTIONS");
      c.header("access-control-allow-headers", "content-type");
      c.header("access-control-max-age", "86400");
      return c.body(null, 204);
    }
    await next();
  });

  app.post("/api/web/chat", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "JSON inválido" }, 400);
    }
    const input = webChatInputSchema.safeParse(body);
    if (!input.success) return c.json({ error: "Mensaje inválido" }, 400);
    const result = await c.get("services").engine.handleInbound({
      channel: "web",
      externalUserId: `web_${input.data.visitorId}`,
      text: input.data.text,
      ...(input.data.name ? { userName: input.data.name } : {}),
    });
    return c.json({
      reply: result.reply,
      buttons: result.buttons,
      attachments: result.attachments,
    });
  });

  app.get("/api/web/messages", async (c) => {
    const visitorId = c.req.query("visitorId") ?? "";
    const after = Number(c.req.query("after") ?? 0) || 0;
    if (visitorId.length < 8 || visitorId.length > 64) return c.json({ messages: [] });
    const { store } = c.get("services");
    const contact = await store.findContact("web", `web_${visitorId}`);
    const conversation = contact ? await store.findOpenConversation(contact.id, "web") : null;
    if (!conversation) return c.json({ messages: [] });
    const messages = await store.listMessagesSince(conversation.id, after);
    return c.json({
      messages: messages
        .filter((m) => m.role === "assistant" || m.role === "human")
        .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  });

  // ---------- Galería (archivos públicos que el bot manda) y páginas de pago ----------

  app.get("/media/:key", async (c) => {
    const key = c.req.param("key");
    if (!c.env.MEDIA || !/^[\w.-]+$/.test(key)) return c.notFound();
    const object = await c.env.MEDIA.get(key);
    if (!object) return c.notFound();
    return c.body(object.body, 200, {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=86400",
    });
  });

  const page = (title: string, text: string) =>
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;text-align:center;padding:16px"><div><h1>${title}</h1><p>${text}</p></div></body></html>`;
  app.get("/pago/ok", (c) => c.html(page("¡Pago recibido!", "Gracias. Ya puedes volver al chat.")));
  app.get("/pago/cancelado", (c) =>
    c.html(
      page("Pago cancelado", "No se hizo ningún cargo. Puedes volver al chat si necesitas ayuda."),
    ),
  );

  // ---------- canales con webhook ----------

  app.route("/webhooks", webhooks);

  // ---------- panel ----------

  app.route("/admin/api", adminApi);

  app.get("/admin", (c) => c.redirect("/admin/"));
  app.get("/admin/*", async (c) => {
    if (!c.env.ASSETS) return c.text("Panel no compilado. Corre `pnpm build`.", 503);
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.status !== 404) return res;
    // SPA: cualquier ruta del panel devuelve index.html
    return c.env.ASSETS.fetch(new Request(new URL("/admin/index.html", c.req.url)));
  });

  return app;
}
