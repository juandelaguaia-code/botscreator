import { ADMIN_ONLY_TABS, type BotSettings } from "@yunque/core";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { type SessionPayload, signSession, timingSafeEqual, verifySession } from "../lib/crypto.js";
import { verifyPassword } from "../lib/password.js";
import { TeamStore, type UserRecord } from "../store/team.js";
import type { Store } from "../store/types.js";
import type { Actor, AppEnv } from "../types.js";

export const SESSION_COOKIE = "yq_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export const OWNER: Actor = { id: "owner", name: "Dueño", role: "owner" };

/** El secreto deriva de la contraseña maestra: cambiarla invalida todas las sesiones. */
function sessionSecret(password: string): string {
  return `yunque-session:v1:${password}`;
}

function clientKey(c: Context<AppEnv>): string {
  return `ip:${c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local"}`;
}

const fingerprint = (user: UserRecord) => (user.passwordHash ?? "").slice(0, 12);

export type LoginResult =
  | { ok: true; token: string; actor: Actor }
  | { ok: false; status: 401 | 429 | 503; error: string; retryAfterMs?: number };

interface Credentials {
  email?: string;
  password: string;
}

/**
 * Entrada al panel: contraseña maestra (dueño) o correo + contraseña personal. Bloqueo de 15 min
 * tras 5 intentos fallidos, por IP y por correo.
 */
export async function attemptLogin(args: {
  store: Store;
  team: TeamStore;
  masterPassword: string | undefined;
  credentials: Credentials;
  key: string;
  now: number;
}): Promise<LoginResult> {
  const { store, team, masterPassword, credentials, now } = args;
  if (!masterPassword) {
    return {
      ok: false,
      status: 503,
      error: "El panel no tiene contraseña. Configura el secreto DASHBOARD_PASSWORD.",
    };
  }
  const keys = [
    args.key,
    ...(credentials.email ? [`email:${credentials.email.toLowerCase()}`] : []),
  ];
  for (const key of keys) {
    const attempt = await store.getLoginAttempt(key);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      return {
        ok: false,
        status: 429,
        error: "Demasiados intentos. Espera unos minutos.",
        retryAfterMs: attempt.lockedUntil - now,
      };
    }
  }

  let actor: Actor | null = null;
  let payload: SessionPayload | null = null;
  if (credentials.email) {
    const user = await team.byEmail(credentials.email);
    if (
      user?.status === "active" &&
      user.passwordHash &&
      user.passwordSalt &&
      (await verifyPassword(credentials.password, user.passwordHash, user.passwordSalt))
    ) {
      actor = { id: user.id, name: user.name, role: user.role };
      payload = { sub: user.id, role: user.role, h: fingerprint(user), exp: now + SESSION_TTL_MS };
      await team.touchLogin(user.id);
    }
  } else if (timingSafeEqual(credentials.password, masterPassword)) {
    actor = OWNER;
    payload = { sub: "owner", role: "owner", exp: now + SESSION_TTL_MS };
  }

  if (!actor || !payload) {
    for (const key of keys) {
      const attempt = await store.getLoginAttempt(key);
      const failures =
        (attempt?.lockedUntil && attempt.lockedUntil <= now ? 0 : (attempt?.failures ?? 0)) + 1;
      await store.saveLoginAttempt(
        key,
        failures,
        failures >= MAX_FAILURES ? now + LOCKOUT_MS : null,
      );
    }
    return {
      ok: false,
      status: 401,
      error: credentials.email ? "Correo o contraseña incorrectos." : "Contraseña incorrecta.",
    };
  }

  for (const key of keys) await store.clearLoginAttempt(key);
  return { ok: true, token: await signSession(payload, sessionSecret(masterPassword)), actor };
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/admin",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Sesión para un usuario que acaba de activar su acceso o cambiar su contraseña. */
export async function sessionFor(c: Context<AppEnv>, user: UserRecord): Promise<string | null> {
  const master = c.env.DASHBOARD_PASSWORD;
  if (!master) return null;
  return signSession(
    { sub: user.id, role: user.role, h: fingerprint(user), exp: Date.now() + SESSION_TTL_MS },
    sessionSecret(master),
  );
}

export async function login(c: Context<AppEnv>, credentials: Credentials): Promise<Response> {
  const team = new TeamStore(c.env.DB);
  const result = await attemptLogin({
    store: c.get("services").store,
    team,
    masterPassword: c.env.DASHBOARD_PASSWORD,
    credentials,
    key: clientKey(c),
    now: Date.now(),
  });
  if (!result.ok) {
    if (result.retryAfterMs) c.header("retry-after", String(Math.ceil(result.retryAfterMs / 1000)));
    return c.json({ error: result.error }, result.status);
  }
  setSessionCookie(c, result.token);
  await team.audit(result.actor, "Entró al panel");
  return c.json({ ok: true });
}

export function logout(c: Context<AppEnv>): Response {
  deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
  return c.json({ ok: true });
}

/** Quién hace la petición, o `null` si no hay sesión válida. */
export async function resolveActor(c: Context<AppEnv>): Promise<Actor | null> {
  // Central de agencia: token propio por bot, enviado como Bearer.
  const bearer = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    if (
      c.env.AGENCY_TOKEN &&
      c.env.AGENCY_TOKEN.length >= 16 &&
      timingSafeEqual(bearer, c.env.AGENCY_TOKEN)
    ) {
      return { id: "agency", name: "Agencia", role: "owner" };
    }
    return null;
  }
  const master = c.env.DASHBOARD_PASSWORD;
  const token = getCookie(c, SESSION_COOKIE);
  if (!master || !token) return null;
  const payload = await verifySession(token, sessionSecret(master), Date.now());
  if (!payload) return null;
  if (payload.sub === "owner" || payload.sub === "admin") return OWNER;
  const user = await new TeamStore(c.env.DB).get(payload.sub);
  if (user?.status !== "active" || fingerprint(user) !== payload.h) return null;
  return { id: user.id, name: user.name, role: user.role, agencyAccess: user.agencyAccess };
}

export async function isAuthenticated(c: Context<AppEnv>): Promise<boolean> {
  return (await resolveActor(c)) !== null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = await resolveActor(c);
  if (!actor) return c.json({ error: "Sesión expirada. Vuelve a entrar." }, 401);
  c.set("actor", actor);
  await next();
};

// ---------- qué puede abrir cada acceso ----------

/** Pestañas que este acceso puede abrir (`null` = todas). La contraseña maestra lo ve todo. */
export function allowedTabs(actor: Actor, settings: BotSettings): string[] | null {
  if (actor.role === "owner") return null;
  const hidden = new Set(settings.branding.hiddenTabs);
  // Modo agencia es del dueño y de su equipo de agencia (hasta 3 colaboradores elegidos por él)
  const allowed =
    actor.role === "admin"
      ? new Set(ALL_TABS.filter((t) => !hidden.has(t) && t !== "/agencia"))
      : new Set(settings.teamSections.filter((t) => !ADMIN_ONLY.has(t) && !hidden.has(t)));
  if (actor.agencyAccess) allowed.add("/agencia");
  return ALL_TABS.filter((t) => allowed.has(t));
}

const ADMIN_ONLY = new Set<string>(ADMIN_ONLY_TABS);

/** Qué puede hacer este acceso en Modo agencia. */
export function agencyAccessOf(actor: Actor): "edit" | "read" | null {
  return actor.role === "owner" ? "edit" : (actor.agencyAccess ?? null);
}

export const ALL_TABS = [
  "/",
  "/bandeja",
  "/clientes",
  "/tickets",
  "/agenda",
  "/analista",
  "/estadisticas",
  "/costos",
  "/campanas",
  "/mejoras",
  "/conocimiento",
  "/galeria",
  "/superpoderes",
  "/prompt",
  "/conexiones",
  "/probar",
  "/comandos",
  "/agencia",
  "/equipo",
  "/configuracion",
];

/** Qué pestaña protege cada grupo de la API. Lo que no está aquí lo puede usar cualquier acceso. */
const API_TAB: Array<[RegExp, string]> = [
  [/^\/(settings|giro|branding)/, "/configuracion"],
  [/^\/prompt/, "/prompt"],
  [/^\/connections/, "/conexiones"],
  [/^\/costs/, "/costos"],
  [/^\/agency/, "/agencia"],
  [/^\/team/, "/equipo"],
  [/^\/export/, "/clientes"],
  [/^\/(insights|automation)/, "/analista"],
  [/^\/stats/, "/estadisticas"],
  [/^\/campaigns/, "/campanas"],
  [/^\/gallery/, "/galeria"],
  [/^\/(kb)/, "/conocimiento"],
  [/^\/gaps/, "/mejoras"],
  [/^\/(appointments|payments)/, "/agenda"],
  [/^\/leads/, "/clientes"],
  [/^\/tickets/, "/tickets"],
  [/^\/playground/, "/probar"],
];

/** El panel puede leer la configuración para pintar la pantalla, aunque no pueda editarla. */
const READ_ALWAYS = [/^\/settings$/];

/** Bloquea en la API lo que el acceso no puede ver en el panel (también escribiendo la URL a mano). */
export const enforceTabs: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = c.get("actor");
  if (!actor || actor.role === "owner") return next();
  const path = c.req.path.replace(/^\/admin\/api/, "");
  if (c.req.method === "GET" && READ_ALWAYS.some((r) => r.test(path))) return next();
  const tab = API_TAB.find(([pattern]) => pattern.test(path))?.[1];
  if (!tab) return next();
  const { settings } = await c.get("services").config();
  const allowed = allowedTabs(actor, settings);
  if (allowed && !allowed.includes(tab))
    return c.json({ error: "Tu acceso no incluye esta sección." }, 403);
  if (tab === "/agencia" && c.req.method !== "GET" && agencyAccessOf(actor) !== "edit") {
    return c.json({ error: "Tu acceso a Modo agencia es de solo lectura." }, 403);
  }
  return next();
};
