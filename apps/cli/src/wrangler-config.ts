import { readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { type BotInstance, botPaths } from "./instance.ts";
import { parseJsonc } from "./text.ts";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

type Json = Record<string, unknown>;

const fromBot = (rootFromDir: string, path: string) =>
  posix.normalize(posix.join(rootFromDir, "apps/bot", path));

/**
 * Configuración de wrangler de un bot, derivada de la plantilla `apps/bot/wrangler.jsonc`. La plantilla
 * es la fuente de verdad (bindings, crons, compatibilidad): aquí solo se cambian nombres, ids, rutas y
 * variables. Así una actualización que agregue un binding llega a todos los bots al regenerarla.
 */
export function buildWranglerConfig(template: Json, bot: BotInstance, rootFromDir: string): Json {
  const config = structuredClone(template);
  delete config.$schema;
  delete config.env;

  const d1 = (config.d1_databases as Json[] | undefined)?.[0] ?? {};
  const vectorize = (config.vectorize as Json[] | undefined)?.[0] ?? {};
  const r2 = (config.r2_buckets as Json[] | undefined)?.[0] ?? {};
  const assets = (config.assets as Json | undefined) ?? {};

  config.name = bot.resources.worker;
  config.main = fromBot(rootFromDir, String(template.main ?? "src/index.ts"));
  if (bot.accountId) config.account_id = bot.accountId;
  config.assets = {
    ...assets,
    directory: fromBot(rootFromDir, String(assets.directory ?? "../panel/dist")),
  };
  config.d1_databases = [
    {
      ...d1,
      binding: "DB",
      database_name: bot.resources.database,
      database_id: bot.resources.databaseId ?? PLACEHOLDER_ID,
      migrations_dir: fromBot(rootFromDir, String(d1.migrations_dir ?? "migrations")),
    },
  ];
  config.vectorize = [{ ...vectorize, binding: "VECTORIZE", index_name: bot.resources.index }];
  config.r2_buckets = [{ ...r2, binding: "MEDIA", bucket_name: bot.resources.bucket }];
  config.vars = {
    ...((template.vars as Json | undefined) ?? {}),
    BOT_NAME: bot.name,
    BOT_GIRO: bot.giro,
    BOT_LANGUAGE: bot.language,
    BOT_CURRENCY: bot.currency,
    BOT_TIMEZONE: bot.timezone,
    LLM_PROVIDER: bot.provider,
    PUBLIC_URL: bot.url ?? "",
  };
  return config;
}

export function readTemplate(root: string): Json {
  return parseJsonc(readFileSync(join(root, "apps/bot/wrangler.jsonc"), "utf8")) as Json;
}

/** Escribe (o regenera) la configuración del bot a partir de la plantilla actual del repo. */
export function writeWranglerConfig(root: string, bot: BotInstance): string {
  const paths = botPaths(root, bot.slug);
  const config = buildWranglerConfig(readTemplate(root), bot, paths.rootFromDir);
  writeFileSync(
    paths.config,
    `// Generado por \`pnpm bot\` a partir de apps/bot/wrangler.jsonc. No lo edites: se regenera en cada\n// actualización. Lo propio de este bot vive en bot.json.\n${JSON.stringify(config, null, 2)}\n`,
  );
  return paths.config;
}

export const isPlaceholderId = (id: string | null) => !id || id === PLACEHOLDER_ID;
