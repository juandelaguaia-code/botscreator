import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Env } from "../src/env.js";
import { createTestD1 } from "./helpers/sqlite-d1.js";

class MemoryR2 {
  readonly objects = new Map<string, ArrayBuffer>();
  async put(key: string, data: ArrayBuffer) {
    this.objects.set(key, data);
  }
  async get() {
    return null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

function setup() {
  const media = new MemoryR2();
  const env = {
    DB: createTestD1(),
    MEDIA: media as unknown as R2Bucket,
    DASHBOARD_PASSWORD: "maestra-123",
    LLM_PROVIDER: "fake",
    BOT_NAME: "Tacos Ana",
    PUBLIC_URL: "https://tacos.example",
  } as Env;
  const app = createApp();
  /** Cada "navegador" guarda su propia cookie. */
  const browser = () => {
    let cookie = "";
    const request = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(
        path,
        {
          ...init,
          headers: {
            ...(init.body && !(init.body instanceof FormData)
              ? { "content-type": "application/json" }
              : {}),
            cookie,
            ...(init.headers ?? {}),
          },
        },
        env,
      );
      const set = res.headers.get("set-cookie");
      if (set?.startsWith("yq_session=")) cookie = set.split(";")[0] as string;
      return res;
    };
    const json = async <T>(path: string, init: RequestInit = {}) =>
      (await (await request(path, init)).json()) as T;
    return { request, json };
  };
  return { env, media, browser };
}

const tokenOf = (link: string) => link.split("/acceso/")[1] as string;

async function inviteAndActivate(
  owner: ReturnType<ReturnType<typeof setup>["browser"]>,
  browser: () => ReturnType<ReturnType<typeof setup>["browser"]>,
  role: "admin" | "team",
  email: string,
) {
  const invite = await owner.json<{ user: { id: string }; link: string }>(
    "/admin/api/team/invites",
    {
      method: "POST",
      body: JSON.stringify({ name: role === "admin" ? "Jefa Ana" : "Luis Mesero", email, role }),
    },
  );
  const person = browser();
  const accepted = await person.request(`/admin/api/access/${tokenOf(invite.link)}`, {
    method: "POST",
    body: JSON.stringify({ password: "clave-personal-1", whatsapp: "+52 55 1234 5678" }),
  });
  expect(accepted.status).toBe(200);
  return { person, userId: invite.user.id, link: invite.link };
}

describe("equipo", () => {
  it("invita, activa con el link y el rol Equipo solo ve lo suyo (también en la API)", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });

    const invite = await owner.json<{ link: string; expiresInDays: number }>(
      "/admin/api/team/invites",
      {
        method: "POST",
        body: JSON.stringify({ name: "Luis Mesero", email: "Luis@Tacos.com", role: "team" }),
      },
    );
    expect(invite.link).toMatch(/^https:\/\/tacos\.example\/admin\/acceso\/[0-9a-f]{64}$/);
    expect(invite.expiresInDays).toBe(7);

    const luis = browser();
    const info = await luis.json<{ valid: boolean; email: string }>(
      `/admin/api/access/${tokenOf(invite.link)}`,
    );
    expect(info).toMatchObject({ valid: true, email: "luis@tacos.com" });
    expect(
      (
        await luis.request(`/admin/api/access/${tokenOf(invite.link)}`, {
          method: "POST",
          body: JSON.stringify({ password: "corta" }),
        })
      ).status,
    ).toBe(400);
    await luis.request(`/admin/api/access/${tokenOf(invite.link)}`, {
      method: "POST",
      body: JSON.stringify({ password: "clave-personal-1" }),
    });

    const session = await luis.json<{
      actor: { role: string; name: string };
      allowedTabs: string[];
    }>("/admin/api/session");
    expect(session.actor).toMatchObject({ role: "team", name: "Luis Mesero" });
    expect(session.allowedTabs).toEqual(["/", "/bandeja", "/clientes", "/tickets", "/agenda"]);

    expect((await luis.request("/admin/api/conversations")).status).toBe(200);
    expect((await luis.request("/admin/api/settings")).status).toBe(200); // lectura para pintar el panel
    for (const path of [
      "/admin/api/costs",
      "/admin/api/team",
      "/admin/api/agency/clients",
      "/admin/api/connections",
      "/admin/api/prompt",
    ]) {
      expect((await luis.request(path)).status).toBe(403);
    }
    expect(
      (await luis.request("/admin/api/settings", { method: "PUT", body: JSON.stringify({}) }))
        .status,
    ).toBe(403);

    // el link es de un solo uso
    expect(
      (
        await luis.request(`/admin/api/access/${tokenOf(invite.link)}`, {
          method: "POST",
          body: JSON.stringify({ password: "otra-clave-1" }),
        })
      ).status,
    ).toBe(410);

    // entrar con correo y contraseña desde otro navegador
    const again = browser();
    const ok = await again.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "luis@tacos.com", password: "clave-personal-1" }),
    });
    expect(ok.status).toBe(200);

    // al activar queda un ticket para el dueño
    const tickets = await owner.json<{ tickets: Array<{ reason: string }> }>("/admin/api/tickets");
    expect(tickets.tickets[0]?.reason).toContain("Luis Mesero ya activó su acceso");
  });

  it("decide qué ve el rol Equipo y respeta las pestañas ocultas para los accesos personales", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    const { person: luis } = await inviteAndActivate(owner, browser, "team", "luis@tacos.com");
    const { person: ana } = await inviteAndActivate(owner, browser, "admin", "ana@tacos.com");

    await owner.request("/admin/api/team/sections", {
      method: "PUT",
      body: JSON.stringify({ sections: ["/bandeja", "/estadisticas", "/costos"] }),
    });
    const luisSession = await luis.json<{ allowedTabs: string[] }>("/admin/api/session");
    expect(luisSession.allowedTabs).toEqual(["/bandeja", "/estadisticas"]); // Costos nunca para el rol Equipo
    expect((await luis.request("/admin/api/stats")).status).toBe(200);
    expect((await luis.request("/admin/api/leads")).status).toBe(403);

    expect((await ana.request("/admin/api/costs")).status).toBe(200);
    const settings = await owner.json<{
      settings: Record<string, unknown> & { branding: Record<string, unknown> };
    }>("/admin/api/settings");
    await owner.request("/admin/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        settings: {
          ...settings.settings,
          branding: { ...settings.settings.branding, hiddenTabs: ["/costos"] },
        },
      }),
    });
    expect((await ana.request("/admin/api/costs")).status).toBe(403);
    expect((await owner.request("/admin/api/costs")).status).toBe(200); // la contraseña maestra ve todo
    const anaSession = await ana.json<{ allowedTabs: string[] }>("/admin/api/session");
    expect(anaSession.allowedTabs).not.toContain("/costos");
    expect(anaSession.allowedTabs).toContain("/configuracion");
  });

  it("desactivar un acceso o cambiar su contraseña corta sus sesiones abiertas", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    const { person: luis, userId } = await inviteAndActivate(
      owner,
      browser,
      "team",
      "luis@tacos.com",
    );
    expect((await luis.request("/admin/api/conversations")).status).toBe(200);

    const { link } = await owner.json<{ link: string; kind: string }>(
      `/admin/api/team/users/${userId}/link`,
      { method: "POST" },
    );
    const other = browser();
    await other.request(`/admin/api/access/${tokenOf(link)}`, {
      method: "POST",
      body: JSON.stringify({ password: "clave-nueva-22" }),
    });
    expect((await luis.request("/admin/api/conversations")).status).toBe(401);

    expect((await other.request("/admin/api/conversations")).status).toBe(200);
    await owner.request(`/admin/api/team/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    expect((await other.request("/admin/api/conversations")).status).toBe(401);
    const login = await browser().request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "luis@tacos.com", password: "clave-nueva-22" }),
    });
    expect(login.status).toBe(401);
  });

  it("bloquea por correo tras 5 intentos fallidos", async () => {
    const { browser } = setup();
    const b = browser();
    for (let i = 0; i < 5; i++) {
      await b.request("/admin/api/login", {
        method: "POST",
        body: JSON.stringify({ email: "nadie@tacos.com", password: "x" }),
      });
    }
    const locked = await browser().request("/admin/api/login", {
      method: "POST",
      headers: { "cf-connecting-ip": "10.0.0.9" },
      body: JSON.stringify({ email: "nadie@tacos.com", password: "x" }),
    });
    expect(locked.status).toBe(429);
  });

  it("recuperar contraseña sin correo configurado deja el link al Administrador y no revela correos", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    await inviteAndActivate(owner, browser, "team", "luis@tacos.com");
    const anon = browser();
    expect(
      (
        await anon.request("/admin/api/forgot", {
          method: "POST",
          body: JSON.stringify({ email: "luis@tacos.com" }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await anon.request("/admin/api/forgot", {
          method: "POST",
          body: JSON.stringify({ email: "nadie@tacos.com" }),
        })
      ).status,
    ).toBe(200);
    const tickets = await owner.json<{ tickets: Array<{ reason: string }> }>("/admin/api/tickets");
    const reset = tickets.tickets.filter((t) => t.reason.includes("pidió recuperar"));
    expect(reset).toHaveLength(1);
    expect(reset[0]?.reason).toMatch(/\/admin\/acceso\/[0-9a-f]{64}/);
  });

  it("asigna conversaciones y deja todo en la bitácora", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/api/web/chat", {
      method: "POST",
      body: JSON.stringify({ visitorId: "visitante-equipo", text: "hola" }),
    });
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    const { userId } = await inviteAndActivate(owner, browser, "team", "luis@tacos.com");

    const { users } = await owner.json<{ users: Array<{ id: string; name: string }> }>(
      "/admin/api/assignees",
    );
    expect(users).toEqual([{ id: userId, name: "Luis Mesero" }]);
    const { conversations } = await owner.json<{ conversations: Array<{ id: string }> }>(
      "/admin/api/conversations",
    );
    const id = conversations[0]?.id;
    const res = await owner.json<{ assignedTo: { name: string } }>(
      `/admin/api/conversations/${id}/assign`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    );
    expect(res.assignedTo.name).toBe("Luis Mesero");
    const list = await owner.json<{
      conversations: Array<{ assignedTo: { name: string } | null }>;
    }>("/admin/api/conversations");
    expect(list.conversations[0]?.assignedTo?.name).toBe("Luis Mesero");

    const { entries } = await owner.json<{ entries: Array<{ action: string; actorName: string }> }>(
      "/admin/api/team/audit",
    );
    const actions = entries.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "Entró al panel",
        "Invitó a una persona",
        "Activó su acceso",
        "Asignó una conversación",
      ]),
    );
  });
});

describe("marca blanca", () => {
  it("la sesión y la pantalla de entrada usan la marca del cliente; el logo vive en el bot", async () => {
    const { browser, media } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    const settings = await owner.json<{
      settings: Record<string, unknown> & { branding: Record<string, unknown> };
    }>("/admin/api/settings");
    await owner.request("/admin/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        settings: {
          ...settings.settings,
          branding: {
            ...settings.settings.branding,
            panelName: "Panel Tacos Ana",
            accentColor: "#1f8a5b",
            style: "terra",
            font: "Poppins",
            loginTitle: "Bienvenida",
          },
        },
      }),
    });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));
    const up = await owner.json<{ logoUrl: string }>("/admin/api/branding/logo", {
      method: "POST",
      body: form,
    });
    expect(up.logoUrl).toMatch(/^https:\/\/tacos\.example\/media\/branding-logo_/);
    expect(media.objects.size).toBe(1);

    const anon = await browser().json<{
      botName: string;
      branding: Record<string, string>;
      authenticated: boolean;
    }>("/admin/api/session");
    expect(anon.authenticated).toBe(false);
    expect(anon.botName).toBe("Panel Tacos Ana");
    expect(anon.branding).toMatchObject({
      accentColor: "#1f8a5b",
      style: "terra",
      font: "Poppins",
      loginTitle: "Bienvenida",
      logoUrl: up.logoUrl,
    });
    expect(JSON.stringify(anon.branding)).not.toContain("hiddenTabs");
  });

  it("rechaza colores inválidos", async () => {
    const { browser } = setup();
    const owner = browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    const settings = await owner.json<{
      settings: Record<string, unknown> & { branding: Record<string, unknown> };
    }>("/admin/api/settings");
    const res = await owner.request("/admin/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        settings: {
          ...settings.settings,
          branding: { ...settings.settings.branding, accentColor: "verde" },
        },
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("equipo de agencia", () => {
  async function ownerSession(setupResult: ReturnType<typeof setup>) {
    const owner = setupResult.browser();
    await owner.request("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: "maestra-123" }),
    });
    return owner;
  }

  it("Modo agencia solo lo ven el dueño y sus colaboradores, con permiso de editar o leer", async () => {
    const s = setup();
    const owner = await ownerSession(s);
    const admin = await inviteAndActivate(owner, s.browser, "admin", "jefa@tacos.com");
    const waiter = await inviteAndActivate(owner, s.browser, "team", "luis@tacos.com");

    // sin permiso, ni el Administrador entra a Modo agencia
    expect((await admin.person.request("/admin/api/agency/clients")).status).toBe(403);
    const before = await admin.person.json<{ allowedTabs: string[]; agencyAccess: null }>(
      "/admin/api/session",
    );
    expect(before.allowedTabs).not.toContain("/agencia");
    expect(before.agencyAccess).toBeNull();

    // el dueño suma a Luis (rol Equipo) en solo lectura
    const put = await owner.request(`/admin/api/agency/collaborators/${waiter.userId}`, {
      method: "PUT",
      body: JSON.stringify({ access: "read" }),
    });
    expect(put.status).toBe(200);
    const luis = await waiter.person.json<{ allowedTabs: string[]; agencyAccess: string }>(
      "/admin/api/session",
    );
    expect(luis.allowedTabs).toContain("/agencia");
    expect(luis.agencyAccess).toBe("read");
    expect((await waiter.person.request("/admin/api/agency/clients")).status).toBe(200);
    const readOnly = await waiter.person.request("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(readOnly.status).toBe(403);
    expect(await readOnly.json()).toEqual({
      error: "Tu acceso a Modo agencia es de solo lectura.",
    });
    // sigue sin ver el resto de lo exclusivo del Administrador
    expect((await waiter.person.request("/admin/api/costs")).status).toBe(403);

    // con permiso de editar ya pasa a la validación de datos
    await owner.request(`/admin/api/agency/collaborators/${waiter.userId}`, {
      method: "PUT",
      body: JSON.stringify({ access: "edit" }),
    });
    const edit = await waiter.person.request("/admin/api/agency/clients", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(edit.status).toBe(400);

    // solo el dueño administra el equipo de agencia
    expect((await waiter.person.request("/admin/api/agency/collaborators")).status).toBe(403);
    const list = await owner.json<{ collaborators: Array<{ id: string }>; max: number }>(
      "/admin/api/agency/collaborators",
    );
    expect(list.collaborators.map((u) => u.id)).toEqual([waiter.userId]);
    expect(list.max).toBe(3);

    // quitarlo le cierra la sección
    await owner.request(`/admin/api/agency/collaborators/${waiter.userId}`, {
      method: "PUT",
      body: JSON.stringify({ access: null }),
    });
    expect((await waiter.person.request("/admin/api/agency/clients")).status).toBe(403);
    const audit = await owner.json<{ entries: Array<{ action: string }> }>("/admin/api/team/audit");
    expect(audit.entries.map((e) => e.action)).toContain("Sumó al equipo de agencia");
  });

  it("admite hasta 3 colaboradores y solo accesos activos", async () => {
    const s = setup();
    const owner = await ownerSession(s);
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      ids.push((await inviteAndActivate(owner, s.browser, "team", `p${n}@tacos.com`)).userId);
    }
    for (const id of ids.slice(0, 3)) {
      const res = await owner.request(`/admin/api/agency/collaborators/${id}`, {
        method: "PUT",
        body: JSON.stringify({ access: "read" }),
      });
      expect(res.status).toBe(200);
    }
    const fourth = await owner.request(`/admin/api/agency/collaborators/${ids[3]}`, {
      method: "PUT",
      body: JSON.stringify({ access: "edit" }),
    });
    expect(fourth.status).toBe(409);
    // cambiar el permiso de uno que ya está no cuenta como nuevo
    const change = await owner.request(`/admin/api/agency/collaborators/${ids[0]}`, {
      method: "PUT",
      body: JSON.stringify({ access: "edit" }),
    });
    expect(change.status).toBe(200);

    const pending = await owner.json<{ user: { id: string } }>("/admin/api/team/invites", {
      method: "POST",
      body: JSON.stringify({ name: "Sin activar", email: "nuevo@tacos.com", role: "team" }),
    });
    await owner.request(`/admin/api/agency/collaborators/${ids[1]}`, {
      method: "PUT",
      body: JSON.stringify({ access: null }),
    });
    const inactive = await owner.request(`/admin/api/agency/collaborators/${pending.user.id}`, {
      method: "PUT",
      body: JSON.stringify({ access: "read" }),
    });
    expect(inactive.status).toBe(409);
  });
});
