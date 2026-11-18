import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../args.ts";
import { OPTIONAL_SECRETS, requiredSecrets } from "../catalog.ts";
import { botPaths, listInstances, loadInstance } from "../instance.ts";
import type { Context } from "../runtime.ts";
import { gitCommit, localVersion } from "../steps.ts";
import { Wrangler } from "../wrangler.ts";
import { isPlaceholderId } from "../wrangler-config.ts";

type Level = "ok" | "warn" | "fail";
const MARK: Record<Level, string> = { ok: "✓", warn: "!", fail: "✗" };

class Report {
  readonly ctx: Context;
  failures = 0;
  warnings = 0;
  constructor(ctx: Context) {
    this.ctx = ctx;
  }
  add(level: Level, what: string, fix?: string) {
    if (level === "fail") this.failures++;
    if (level === "warn") this.warnings++;
    this.ctx.io.log(`${MARK[level]} ${what}${fix && level !== "ok" ? `\n    → ${fix}` : ""}`);
  }
}

function nodeAtLeast(version: string, min: [number, number]): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > min[0] || (major === min[0] && minor >= min[1]);
}

/**
 * `doctor`: revisa el equipo (Node, dependencias, sesión de Cloudflare) y, si se indica un bot, su
 * estado en vivo: recursos, salud, secretos, migraciones pendientes y si hay una versión nueva.
 */
export async function doctorCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const r = new Report(ctx);
  ctx.io.log("Tu equipo");
  r.add(
    nodeAtLeast(process.versions.node, [22, 18]) ? "ok" : "fail",
    `Node ${process.versions.node}`,
    "Instala Node 22.18 o superior (nodejs.org).",
  );
  const deps = existsSync(join(ctx.root, "apps/bot/node_modules/.bin/wrangler"));
  r.add(deps ? "ok" : "fail", "Dependencias instaladas", "Corre: pnpm install");
  const w0 = new Wrangler(ctx);
  const session = await w0.whoami();
  r.add(
    session.loggedIn ? "ok" : "fail",
    "Sesión de Cloudflare",
    "Corre: pnpm --filter @yunque/bot exec wrangler login",
  );
  const built = existsSync(join(ctx.root, "apps/panel/dist"));
  r.add(
    built ? "ok" : "warn",
    "Panel compilado",
    "Se compila solo al instalar; o corre: pnpm build",
  );

  const slug = args.positionals[0];
  const bots = slug ? [loadInstance(ctx.root, slug)] : listInstances(ctx.root);
  if (!slug) {
    ctx.io.log(
      bots.length
        ? `\nBots en este equipo: ${bots.map((b) => b.slug).join(", ")} (revisa uno con: pnpm bot doctor <bot>)`
        : "\nTodavía no hay bots. Crea uno con: pnpm bot init",
    );
  } else {
    const bot = bots[0];
    if (bot) {
      ctx.io.log(`\nBot "${bot.name}" (${bot.slug})`);
      const config = botPaths(ctx.root, bot.slug).config;
      const w = new Wrangler(ctx, bot.accountId);
      const installed = !isPlaceholderId(bot.resources.databaseId);
      r.add(
        installed ? "ok" : "fail",
        "Recursos en Cloudflare",
        `Corre: pnpm bot instalar ${bot.slug}`,
      );

      if (bot.url) {
        try {
          const res = await ctx.fetch(`${bot.url}/healthz`, { signal: AbortSignal.timeout(8000) });
          const health = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: string };
          r.add(
            res.ok && health.ok ? "ok" : "fail",
            `Responde en ${bot.url}${health.version ? ` (versión ${health.version})` : ""}`,
            `Revisa los registros: pnpm --filter @yunque/bot exec wrangler tail -c ${config}`,
          );
        } catch {
          r.add(
            "fail",
            `No responde en ${bot.url}`,
            `Vuelve a desplegar: pnpm bot actualizar ${bot.slug}`,
          );
        }
      } else if (installed) {
        r.add("warn", "Sin URL registrada", `Vuelve a desplegar: pnpm bot actualizar ${bot.slug}`);
      }

      if (installed && session.loggedIn) {
        const secrets = await w.secretNames(config);
        if (secrets === null) {
          r.add("warn", "No pude leer los secretos", "¿El Worker ya está desplegado?");
        } else {
          for (const name of requiredSecrets(bot.provider)) {
            r.add(
              secrets.includes(name) ? "ok" : "fail",
              `Secreto ${name}`,
              `Corre: pnpm bot secreto ${bot.slug} ${name}`,
            );
          }
          const off = OPTIONAL_SECRETS.filter((o) => !o.names.every((n) => secrets.includes(n)));
          if (off.length)
            ctx.io.log(`  · Opcionales sin configurar: ${off.map((o) => o.enables).join(", ")}`);
        }
        const pending = await w.pendingMigrations(config);
        if (pending === null) r.add("warn", "No pude consultar las migraciones");
        else
          r.add(
            pending === 0 ? "ok" : "warn",
            pending === 0 ? "Base de datos al día" : `${pending} migración(es) pendiente(s)`,
            `Corre: pnpm bot actualizar ${bot.slug}`,
          );
      }

      const head = await gitCommit(ctx);
      if (bot.deployedCommit && head && head !== bot.deployedCommit) {
        r.add(
          "warn",
          `Hay una versión más nueva sin desplegar (${bot.deployedCommit} → ${head}, ${localVersion(ctx.root) ?? "?"})`,
          `Corre: pnpm bot actualizar ${bot.slug}`,
        );
      } else if (bot.deployedCommit) r.add("ok", `Versión desplegada ${bot.deployedCommit}`);
      if (bot.pairedWith) ctx.io.log(`  · Vinculado a la central ${bot.pairedWith}`);
    }
  }

  ctx.io.log(
    r.failures
      ? `\n${r.failures} problema(s) por resolver.`
      : r.warnings
        ? `\nTodo funciona; ${r.warnings} aviso(s).`
        : "\nTodo en orden.",
  );
  return r.failures ? 1 : 0;
}
