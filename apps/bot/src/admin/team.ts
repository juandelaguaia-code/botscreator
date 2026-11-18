import {
  accessAcceptSchema,
  assignInputSchema,
  teamInviteSchema,
  userUpdateSchema,
} from "@yunque/core";
import { Hono } from "hono";
import { z } from "zod";
import { SETTINGS_KEYS } from "../engine/config.js";
import { hashPassword } from "../lib/password.js";
import { publicUser, TeamStore } from "../store/team.js";
import type { AppEnv } from "../types.js";
import { sessionFor, setSessionCookie } from "./auth.js";
import { readJson } from "./http.js";

function base(c: { env: { PUBLIC_URL?: string }; req: { url: string } }): string {
  return c.env.PUBLIC_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
}

/** Equipo: accesos personales, visibilidad del rol Equipo, bitácora y asignación de chats. */
export const teamApi = new Hono<AppEnv>();

teamApi.get("/team", async (c) => {
  const team = new TeamStore(c.env.DB);
  const { settings } = await c.get("services").config();
  return c.json({
    users: (await team.list()).map(publicUser),
    teamSections: settings.teamSections,
  });
});

teamApi.post("/team/invites", async (c) => {
  const input = await readJson(c.req.raw, teamInviteSchema);
  if (!input) return c.json({ error: "Nombre, correo válido y rol." }, 400);
  const team = new TeamStore(c.env.DB);
  if (await team.byEmail(input.email))
    return c.json({ error: "Ya existe un acceso con ese correo." }, 409);
  const user = await team.create(input);
  const token = await team.issueToken(user.id, "invite");
  await team.audit(c.get("actor") ?? null, "Invitó a una persona", `${input.name} (${input.role})`);
  return c.json(
    { user: publicUser(user), link: `${base(c)}/admin/acceso/${token}`, expiresInDays: 7 },
    201,
  );
});

/** Nuevo link para alguien que perdió el suyo u olvidó su contraseña (la reinicia al usarlo). */
teamApi.post("/team/users/:id/link", async (c) => {
  const team = new TeamStore(c.env.DB);
  const user = await team.get(c.req.param("id"));
  if (!user) return c.json({ error: "Acceso no encontrado" }, 404);
  const kind = user.status === "invited" ? "invite" : "reset";
  const token = await team.issueToken(user.id, kind);
  await team.audit(c.get("actor") ?? null, "Generó un link de acceso", user.name);
  return c.json({ link: `${base(c)}/admin/acceso/${token}`, kind });
});

teamApi.patch("/team/users/:id", async (c) => {
  const input = await readJson(c.req.raw, userUpdateSchema);
  if (!input) return c.json({ error: "Datos inválidos." }, 400);
  const team = new TeamStore(c.env.DB);
  const user = await team.get(c.req.param("id"));
  if (!user) return c.json({ error: "Acceso no encontrado" }, 404);
  if (input.status === "active" && !user.passwordHash) {
    return c.json({ error: "Esa persona todavía no activa su invitación." }, 409);
  }
  await team.update(user.id, input);
  await team.audit(
    c.get("actor") ?? null,
    "Cambió un acceso",
    `${user.name}: ${JSON.stringify(input)}`,
  );
  return c.json({ user: publicUser({ ...user, ...input }) });
});

teamApi.delete("/team/users/:id", async (c) => {
  const team = new TeamStore(c.env.DB);
  const user = await team.get(c.req.param("id"));
  if (!user || !(await team.remove(user.id))) return c.json({ error: "Acceso no encontrado" }, 404);
  await team.audit(c.get("actor") ?? null, "Eliminó un acceso", user.name);
  return c.json({ ok: true });
});

teamApi.put("/team/sections", async (c) => {
  const input = await readJson(
    c.req.raw,
    z.object({ sections: z.array(z.string().max(40)).max(30) }),
  );
  if (!input) return c.json({ error: "Secciones inválidas." }, 400);
  const { store, config } = c.get("services");
  const { settings } = await config();
  await store.setSetting(SETTINGS_KEYS.settings, { ...settings, teamSections: input.sections });
  await new TeamStore(c.env.DB).audit(
    c.get("actor") ?? null,
    "Cambió lo que ve el rol Equipo",
    input.sections.join(", "),
  );
  return c.json({ teamSections: input.sections });
});

teamApi.get("/team/audit", async (c) =>
  c.json({ entries: await new TeamStore(c.env.DB).auditLog(200) }),
);

/** Lista corta para el selector "Asignado a" de la bandeja (cualquier acceso la puede leer). */
teamApi.get("/assignees", async (c) => {
  const users = (await new TeamStore(c.env.DB).list()).filter((u) => u.status === "active");
  return c.json({ users: users.map((u) => ({ id: u.id, name: u.name })) });
});

teamApi.post("/conversations/:id/assign", async (c) => {
  const input = await readJson(c.req.raw, assignInputSchema);
  if (!input) return c.json({ error: "Persona inválida." }, 400);
  const team = new TeamStore(c.env.DB);
  const assignee = input.userId ? await team.get(input.userId) : null;
  if (input.userId && assignee?.status !== "active")
    return c.json({ error: "Esa persona no tiene un acceso activo." }, 400);
  if (!(await team.assign(c.req.param("id"), input.userId)))
    return c.json({ error: "Conversación no encontrada" }, 404);
  await team.audit(
    c.get("actor") ?? null,
    "Asignó una conversación",
    assignee?.name ?? "sin asignar",
  );
  // aviso por correo a la persona asignada, si el bot tiene correo configurado
  if (assignee && c.env.RESEND_API_KEY && c.env.EMAIL_FROM) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: c.env.EMAIL_FROM,
        to: [assignee.email],
        subject: "Te asignaron una conversación",
        text: `Tienes una conversación asignada: ${base(c)}/admin/bandeja/${c.req.param("id")}`,
      }),
    }).catch(() => undefined);
  }
  return c.json({
    ok: true,
    assignedTo: assignee ? { id: assignee.id, name: assignee.name } : null,
  });
});

// ---------- públicas: activar acceso y recuperar contraseña ----------

export const accessApi = new Hono<AppEnv>();

accessApi.get("/access/:token", async (c) => {
  const found = await new TeamStore(c.env.DB).findToken(c.req.param("token"));
  if (!found) return c.json({ valid: false });
  return c.json({ valid: true, kind: found.kind, name: found.user.name, email: found.user.email });
});

accessApi.post("/access/:token", async (c) => {
  const input = await readJson(c.req.raw, accessAcceptSchema);
  if (!input) return c.json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
  const team = new TeamStore(c.env.DB);
  const found = await team.findToken(c.req.param("token"));
  if (!found) return c.json({ error: "El link venció o ya se usó. Pide uno nuevo." }, 410);
  const { hash, salt } = await hashPassword(input.password);
  await team.setPassword(found.user.id, hash, salt);
  await team.update(found.user.id, {
    ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
    ...(input.position ? { position: input.position } : {}),
  });
  await team.useToken(found.hash);
  await team.touchLogin(found.user.id);
  const user = await team.get(found.user.id);
  if (!user) return c.json({ error: "Acceso no encontrado" }, 404);
  await team.audit(
    { id: user.id, name: user.name },
    found.kind === "invite" ? "Activó su acceso" : "Cambió su contraseña",
  );
  if (found.kind === "invite") {
    await c.get("services").store.createTicket({
      conversationId: null,
      kind: "system",
      reason: `${user.name} ya activó su acceso al panel`,
    });
  }
  const token = await sessionFor(c, user);
  if (token) setSessionCookie(c, token);
  return c.json({ ok: true });
});

/**
 * "¿Olvidaste tu contraseña?": con correo configurado le llega un link de 1 hora; sin correo, el
 * Administrador recibe un ticket con el link. Siempre responde igual para no revelar qué correos existen.
 */
accessApi.post("/forgot", async (c) => {
  const input = await readJson(
    c.req.raw,
    z.object({ email: z.string().trim().toLowerCase().email() }),
  );
  if (!input) return c.json({ error: "Escribe tu correo." }, 400);
  const team = new TeamStore(c.env.DB);
  const user = await team.byEmail(input.email);
  if (user?.status === "active") {
    const link = `${base(c)}/admin/acceso/${await team.issueToken(user.id, "reset")}`;
    if (c.env.RESEND_API_KEY && c.env.EMAIL_FROM) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: c.env.EMAIL_FROM,
          to: [user.email],
          subject: "Recupera tu acceso al panel",
          text: `Para elegir una contraseña nueva entra aquí (vale 1 hora): ${link}`,
        }),
      }).catch(() => undefined);
    } else {
      await c.get("services").store.createTicket({
        conversationId: null,
        kind: "system",
        reason: `${user.name} pidió recuperar su contraseña. Pásale este link (vale 1 hora): ${link}`,
      });
    }
    await team.audit({ id: user.id, name: user.name }, "Pidió recuperar su contraseña");
  }
  return c.json({ ok: true });
});
