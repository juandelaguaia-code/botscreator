import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GIROS, LANGUAGES, PROVIDERS, type Provider } from "./catalog.ts";
import { parseJsonc, SLUG_PATTERN } from "./text.ts";

/** Un bot instalado: sus datos de arranque y los recursos que ocupa en Cloudflare. */
export interface BotInstance {
  slug: string;
  name: string;
  giro: (typeof GIROS)[number];
  language: (typeof LANGUAGES)[number];
  currency: string;
  timezone: string;
  provider: Provider;
  /** Cuenta de Cloudflare (la del cliente o la de la agencia). `null` = la de `wrangler login`. */
  accountId: string | null;
  resources: {
    worker: string;
    database: string;
    databaseId: string | null;
    index: string;
    bucket: string;
  };
  url: string | null;
  /** Central de agencia donde quedó vinculado. */
  pairedWith: string | null;
  createdAt: string;
  deployedAt: string | null;
  deployedCommit: string | null;
}

/** Dónde vive cada cosa de un bot dentro del repo (`.yunque/` está en .gitignore). */
export function botPaths(root: string, slug: string) {
  const dir = join(root, ".yunque", "bots", slug);
  return {
    dir,
    file: join(dir, "bot.json"),
    config: join(dir, "wrangler.jsonc"),
    backups: join(root, ".yunque", "respaldos"),
    /** Ruta del repo vista desde la carpeta del bot, para la configuración de wrangler. */
    rootFromDir: "../../..",
  };
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown) => v === null || isString(v);

/** Valida un `bot.json`; un archivo editado a mano con errores se reporta en vez de romper a medias. */
export function parseInstance(raw: unknown): BotInstance {
  const b = raw as Partial<BotInstance> | null;
  const r = b?.resources;
  const problems: string[] = [];
  if (!b || typeof b !== "object") throw new Error("bot.json no es un objeto");
  if (!isString(b.slug) || !SLUG_PATTERN.test(b.slug)) problems.push("slug");
  if (!isString(b.name) || !b.name.trim()) problems.push("name");
  if (!GIROS.includes(b.giro as (typeof GIROS)[number])) problems.push("giro");
  if (!LANGUAGES.includes(b.language as (typeof LANGUAGES)[number])) problems.push("language");
  if (!PROVIDERS.includes(b.provider as Provider)) problems.push("provider");
  if (!isString(b.currency) || !isString(b.timezone)) problems.push("currency/timezone");
  if (!isNullableString(b.accountId) || !isNullableString(b.url)) problems.push("accountId/url");
  if (
    !r ||
    !isString(r.worker) ||
    !isString(r.database) ||
    !isString(r.index) ||
    !isString(r.bucket) ||
    !isNullableString(r.databaseId)
  )
    problems.push("resources");
  if (problems.length) throw new Error(`bot.json inválido (${problems.join(", ")})`);
  const bot = b as BotInstance;
  return {
    ...bot,
    pairedWith: bot.pairedWith ?? null,
    deployedAt: bot.deployedAt ?? null,
    deployedCommit: bot.deployedCommit ?? null,
  };
}

export function loadInstance(root: string, slug: string): BotInstance {
  const { file } = botPaths(root, slug);
  if (!existsSync(file)) throw new Error(`No existe el bot "${slug}". Créalo con: pnpm bot init`);
  return parseInstance(parseJsonc(readFileSync(file, "utf8")));
}

export function saveInstance(root: string, bot: BotInstance): void {
  const { dir, file } = botPaths(root, bot.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(bot, null, 2)}\n`);
}

export function listInstances(root: string): BotInstance[] {
  const base = join(root, ".yunque", "bots");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, "bot.json")))
    .flatMap((d) => {
      try {
        return [loadInstance(root, d.name)];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Resuelve qué bot usar: el indicado, o el único que hay. */
export function pickInstance(root: string, slug: string | undefined): BotInstance {
  if (slug) return loadInstance(root, slug);
  const all = listInstances(root);
  if (all.length === 1 && all[0]) return all[0];
  if (all.length === 0) throw new Error("Todavía no hay bots. Crea uno con: pnpm bot init");
  throw new Error(`Indica cuál bot: ${all.map((b) => b.slug).join(", ")}`);
}
