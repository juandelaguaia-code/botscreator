import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type BotInstance, botPaths, saveInstance } from "./instance.ts";
import { CliError, type Context } from "./runtime.ts";
import type { Wrangler } from "./wrangler.ts";
import { writeWranglerConfig } from "./wrangler-config.ts";

export const ok = (ctx: Context, what: string, detail = "") =>
  ctx.io.log(`✓ ${what}${detail ? `: ${detail}` : ""}`);

export async function requireLogin(ctx: Context, w: Wrangler): Promise<void> {
  const { loggedIn } = await w.whoami();
  if (!loggedIn) {
    throw new CliError(
      "No hay sesión de Cloudflare en esta terminal. Corre `pnpm --filter @yunque/bot exec wrangler login` y vuelve a intentar.",
    );
  }
  ok(ctx, "Sesión de Cloudflare");
}

export async function gitCommit(ctx: Context): Promise<string | null> {
  const res = await ctx.runner.run("git", ["rev-parse", "--short", "HEAD"], { cwd: ctx.root });
  return res.code === 0 ? res.stdout.trim() || null : null;
}

const stamp = (d: Date) => d.toISOString().slice(0, 19).replace(/[:T]/g, "-");

/** Respaldo completo de la base del bot en `.yunque/respaldos/` antes de tocar nada. */
export async function backup(ctx: Context, w: Wrangler, bot: BotInstance): Promise<string> {
  const paths = botPaths(ctx.root, bot.slug);
  mkdirSync(paths.backups, { recursive: true });
  const output = join(paths.backups, `${bot.slug}-${stamp(ctx.now())}.sql`);
  await w.exportDb(paths.config, bot.resources.database, output);
  ok(ctx, "Respaldo de la base", output.replace(`${ctx.root}/`, ""));
  return output;
}

/** Compila el panel, aplica migraciones y despliega. Lo comparten `instalar` y `actualizar`. */
export async function ship(ctx: Context, w: Wrangler, bot: BotInstance): Promise<BotInstance> {
  const config = writeWranglerConfig(ctx.root, bot);
  const build = await ctx.runner.run("pnpm", ["build"], { cwd: ctx.root });
  if (build.code !== 0) {
    throw new CliError(`No se pudo compilar el panel:\n${(build.stderr || build.stdout).trim()}`);
  }
  ok(ctx, "Panel compilado");
  await w.migrate(config);
  ok(ctx, "Migraciones de la base al día");
  const url = await w.deploy(config);
  const updated: BotInstance = {
    ...bot,
    url: url ?? bot.url,
    deployedAt: ctx.now().toISOString(),
    deployedCommit: await gitCommit(ctx),
  };
  saveInstance(ctx.root, updated);
  // la URL pública queda en la configuración para el próximo despliegue (links de avisos e invitaciones)
  writeWranglerConfig(ctx.root, updated);
  ok(ctx, "Desplegado", updated.url ?? "revisa la URL en tu panel de Cloudflare");
  return updated;
}

/** Versión del bot en el repo (la que se desplegaría ahora). */
export function localVersion(root: string): string | null {
  const file = join(root, "apps/bot/src/env.ts");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").match(/APP_VERSION = "([^"]+)"/)?.[1] ?? null;
}

/** Conexión con la central de agencia: la misma del CLI de operación (`pnpm yunque`). */
export function readCentral(ctx: Context): { url: string; password: string } | null {
  let url = ctx.env.YUNQUE_URL;
  let password = ctx.env.YUNQUE_PASSWORD;
  const file = join(ctx.root, "apps/bot/.yunque.json");
  if ((!url || !password) && existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { url?: string; password?: string };
      url ||= saved.url;
      password ||= saved.password;
    } catch {
      // archivo dañado: se trata como si no hubiera conexión
    }
  }
  return url && password ? { url: url.replace(/\/$/, ""), password } : null;
}

/** Sesión en el panel de la central para usar su API de Modo agencia. */
export async function centralSession(ctx: Context, central: { url: string; password: string }) {
  const login = await ctx.fetch(`${central.url}/admin/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: central.password }),
  });
  if (!login.ok) throw new CliError(`La central rechazó el acceso (${login.status}).`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return async <T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
    const res = await ctx.fetch(`${central.url}/admin/api${path}`, {
      ...init,
      headers: {
        cookie,
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
  };
}
