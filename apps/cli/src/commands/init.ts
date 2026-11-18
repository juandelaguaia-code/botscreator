import { existsSync } from "node:fs";
import type { ParsedArgs } from "../args.ts";
import { GIROS, LANGUAGES, PROVIDERS, type Provider } from "../catalog.ts";
import { type BotInstance, botPaths, saveInstance } from "../instance.ts";
import { CliError, type Context } from "../runtime.ts";
import { ok } from "../steps.ts";
import { resourceNames, SLUG_PATTERN, slugify } from "../text.ts";
import { writeWranglerConfig } from "../wrangler-config.ts";

const flag = (args: ParsedArgs, name: string) => {
  const v = args.flags[name];
  return typeof v === "string" ? v.trim() : undefined;
};

function oneOf<T extends string>(value: string, list: readonly T[], what: string): T {
  if (!list.includes(value as T))
    throw new CliError(`${what} inválido: "${value}". Opciones: ${list.join(", ")}`);
  return value as T;
}

/**
 * `init`: registra un bot nuevo en `.yunque/bots/<slug>/` (sus datos y su configuración de wrangler).
 * No toca Cloudflare: eso lo hace `instalar`. Sin terminal interactiva, todo va por opciones.
 */
export async function initCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const { io } = ctx;
  const name = flag(args, "nombre") ?? args.positionals[0] ?? (await io.ask("Nombre del negocio"));
  if (!name) {
    throw new CliError(
      'Falta el nombre. Uso: pnpm bot init --nombre "Barbería Don Pepe" --giro barberia',
    );
  }
  if (io.interactive && !flag(args, "giro")) io.log(`Giros: ${GIROS.join(", ")}`);
  const giro = oneOf(flag(args, "giro") ?? (await io.ask("Giro", "general")), GIROS, "Giro");
  const language = oneOf(flag(args, "idioma") ?? "es-419", LANGUAGES, "Idioma");
  const provider: Provider = oneOf(flag(args, "proveedor") ?? "anthropic", PROVIDERS, "Proveedor");
  const slug = flag(args, "slug") ?? slugify(name);
  if (!SLUG_PATTERN.test(slug)) {
    throw new CliError(
      `Identificador inválido: "${slug}". Usa minúsculas, números y guiones (máx. 24).`,
    );
  }
  if (existsSync(botPaths(ctx.root, slug).file)) {
    throw new CliError(
      `Ya existe un bot "${slug}". Elige otro con --slug o revisa: pnpm bot lista`,
    );
  }

  const bot: BotInstance = {
    slug,
    name,
    giro,
    language,
    currency: flag(args, "moneda") ?? "$",
    timezone: flag(args, "zona") ?? "America/Mexico_City",
    provider,
    accountId: flag(args, "cuenta") ?? null,
    resources: { ...resourceNames(slug), databaseId: null },
    url: null,
    pairedWith: null,
    createdAt: ctx.now().toISOString(),
    deployedAt: null,
    deployedCommit: null,
  };
  saveInstance(ctx.root, bot);
  writeWranglerConfig(ctx.root, bot);
  ok(ctx, `Bot "${name}" registrado`, `.yunque/bots/${slug}/`);
  io.log(`  Worker ${bot.resources.worker} · base ${bot.resources.database} · giro ${giro}`);
  io.log(`\nSiguiente paso: pnpm bot instalar ${slug}`);
  return 0;
}
