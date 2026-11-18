import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { signSession, timingSafeEqual, verifySession } from "../lib/crypto.js";
import type { Store } from "../store/types.js";
import type { AppEnv } from "../types.js";

export const SESSION_COOKIE = "yq_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** El secreto deriva de la contraseña maestra: cambiarla invalida todas las sesiones. */
function sessionSecret(password: string): string {
  return `yunque-session:v1:${password}`;
}

function clientKey(c: Context<AppEnv>): string {
  return `ip:${c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "local"}`;
}

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; status: 401 | 429 | 503; error: string; retryAfterMs?: number };

/** Verifica la contraseña con bloqueo tras `MAX_FAILURES` intentos fallidos. */
export async function attemptLogin(args: {
  store: Store;
  password: string | undefined;
  candidate: string;
  key: string;
  now: number;
}): Promise<LoginResult> {
  const { store, password, candidate, key, now } = args;
  if (!password) {
    return {
      ok: false,
      status: 503,
      error: "El panel no tiene contraseña. Configura el secreto DASHBOARD_PASSWORD.",
    };
  }

  const attempt = await store.getLoginAttempt(key);
  if (attempt?.lockedUntil && attempt.lockedUntil > now) {
    return {
      ok: false,
      status: 429,
      error: "Demasiados intentos. Espera unos minutos.",
      retryAfterMs: attempt.lockedUntil - now,
    };
  }

  if (!timingSafeEqual(candidate, password)) {
    const failures =
      (attempt?.lockedUntil && attempt.lockedUntil <= now ? 0 : (attempt?.failures ?? 0)) + 1;
    const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : null;
    await store.saveLoginAttempt(key, failures, lockedUntil);
    return { ok: false, status: 401, error: "Contraseña incorrecta." };
  }

  await store.clearLoginAttempt(key);
  const token = await signSession(
    { sub: "admin", exp: now + SESSION_TTL_MS },
    sessionSecret(password),
  );
  return { ok: true, token };
}

export async function login(c: Context<AppEnv>, candidate: string): Promise<Response> {
  const result = await attemptLogin({
    store: c.get("services").store,
    password: c.env.DASHBOARD_PASSWORD,
    candidate,
    key: clientKey(c),
    now: Date.now(),
  });
  if (!result.ok) {
    if (result.retryAfterMs) c.header("retry-after", String(Math.ceil(result.retryAfterMs / 1000)));
    return c.json({ error: result.error }, result.status);
  }
  setCookie(c, SESSION_COOKIE, result.token, {
    path: "/admin",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ ok: true });
}

export function logout(c: Context<AppEnv>): Response {
  deleteCookie(c, SESSION_COOKIE, { path: "/admin" });
  return c.json({ ok: true });
}

export async function isAuthenticated(c: Context<AppEnv>): Promise<boolean> {
  const password = c.env.DASHBOARD_PASSWORD;
  const token = getCookie(c, SESSION_COOKIE);
  if (!password || !token) return false;
  return (await verifySession(token, sessionSecret(password), Date.now())) !== null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await isAuthenticated(c)))
    return c.json({ error: "Sesión expirada. Vuelve a entrar." }, 401);
  await next();
};
