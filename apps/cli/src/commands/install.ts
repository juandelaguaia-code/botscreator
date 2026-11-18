import type { ParsedArgs } from "../args.ts";
import { requiredSecrets } from "../catalog.ts";
import { botPaths, listInstances, pickInstance, saveInstance } from "../instance.ts";
import { CliError, type Context } from "../runtime.ts";
import { backup, ok, requireLogin, ship } from "../steps.ts";
import { Wrangler } from "../wrangler.ts";
import { isPlaceholderId, writeWranglerConfig } from "../wrangler-config.ts";

const SECRET_HELP: Record<string, string> = {
  DASHBOARD_PASSWORD: "contraseña maestra del panel /admin (elige una larga y guárdala)",
  ANTHROPIC_API_KEY: "llave de Claude (console.anthropic.com → API Keys)",
  OPENAI_API_KEY: "llave de OpenAI (platform.openai.com → API keys)",
  XAI_API_KEY: "llave de xAI (console.x.ai)",
  GEMINI_API_KEY: "llave de Gemini (aistudio.google.com → API key)",
};

/**
 * `instalar`: crea los recursos del bot en Cloudflare (base D1, índice Vectorize y bucket R2), despliega
 * y pide los secretos que falten. Se puede repetir: lo que ya existe se reutiliza.
 */
export async function installCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  let bot = pickInstance(ctx.root, args.positionals[0]);
  const w = new Wrangler(ctx, bot.accountId);
  ctx.io.log(`Instalando "${bot.name}" (${bot.slug})…`);
  await requireLogin(ctx, w);

  // 1. base de datos (la de este bot y de ningún otro)
  if (isPlaceholderId(bot.resources.databaseId)) {
    const existing = await w.d1Id(bot.resources.database);
    const id = existing ?? (await w.d1Create(bot.resources.database));
    bot = { ...bot, resources: { ...bot.resources, databaseId: id } };
    saveInstance(ctx.root, bot);
    writeWranglerConfig(ctx.root, bot);
    ok(ctx, "Base de datos", `${bot.resources.database} ${existing ? "(ya existía)" : "(creada)"}`);
  } else ok(ctx, "Base de datos", `${bot.resources.database} (ya existía)`);

  // 2. índice de la base de conocimiento
  if (await w.vectorizeExists(bot.resources.index)) {
    ok(ctx, "Índice de conocimiento", `${bot.resources.index} (ya existía)`);
  } else {
    await w.vectorizeCreate(bot.resources.index);
    ok(ctx, "Índice de conocimiento", `${bot.resources.index} (creado)`);
  }

  // 3. archivos (Galería, logo del panel)
  const bucket = await w.r2Create(bot.resources.bucket);
  ok(
    ctx,
    "Archivos",
    `${bot.resources.bucket} (${bucket === "created" ? "creado" : "ya existía"})`,
  );

  // 4. compilar, migrar y desplegar
  bot = await ship(ctx, w, bot);

  // 5. secretos: los escribe la persona directo en wrangler; el CLI nunca los ve
  const config = botPaths(ctx.root, bot.slug).config;
  const present = (await w.secretNames(config)) ?? [];
  const missing = requiredSecrets(bot.provider).filter((s) => !present.includes(s));
  if (missing.length && ctx.io.interactive && !args.flags["sin-secretos"]) {
    for (const name of missing) {
      ctx.io.log(`\nEscribe ${name}: ${SECRET_HELP[name] ?? ""}`);
      if (await w.secretPrompt(config, name)) ok(ctx, `Secreto ${name}`);
      else ctx.io.warn(`! No se guardó ${name}. Después: pnpm bot secreto ${bot.slug} ${name}`);
    }
  } else if (missing.length) {
    ctx.io.log("\nFaltan secretos. Escríbelos tú en tu terminal (nunca en un chat):");
    for (const name of missing) {
      ctx.io.log(`  pnpm bot secreto ${bot.slug} ${name}   # ${SECRET_HELP[name] ?? ""}`);
    }
  } else ok(ctx, "Secretos", "completos");

  ctx.io.log(
    `\nListo. Panel: ${bot.url ? `${bot.url}/admin` : "(URL en tu cuenta de Cloudflare)"}`,
  );
  ctx.io.log(
    "  · Entra con la contraseña maestra y completa los datos del negocio en Configuración.",
  );
  ctx.io.log("  · El código del chat para tu web está en el Resumen del panel.");
  ctx.io.log(`  · Revisión completa: pnpm bot doctor ${bot.slug}`);
  return 0;
}

/**
 * `actualizar`: respaldo de la base, configuración regenerada desde la plantilla actual, migraciones y
 * despliegue. La configuración del dueño vive en la base, así que no se toca.
 */
export async function updateCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const targets = args.flags.todos
    ? listInstances(ctx.root).filter((b) => !isPlaceholderId(b.resources.databaseId))
    : [pickInstance(ctx.root, args.positionals[0])];
  if (targets.length === 0) throw new CliError("No hay bots instalados para actualizar.");

  const failed: string[] = [];
  for (const target of targets) {
    if (isPlaceholderId(target.resources.databaseId)) {
      throw new CliError(
        `"${target.slug}" todavía no está instalado. Corre: pnpm bot instalar ${target.slug}`,
      );
    }
    ctx.io.log(`\nActualizando "${target.name}" (${target.slug})…`);
    const w = new Wrangler(ctx, target.accountId);
    try {
      await requireLogin(ctx, w);
      if (!args.flags["sin-respaldo"]) await backup(ctx, w, target);
      const before = target.deployedCommit;
      const after = await ship(ctx, w, target);
      if (before && after.deployedCommit && before !== after.deployedCommit) {
        const log = await ctx.runner.run(
          "git",
          ["log", "--oneline", "-n", "15", `${before}..${after.deployedCommit}`],
          { cwd: ctx.root },
        );
        if (log.code === 0 && log.stdout.trim()) {
          ctx.io.log(`Cambios desde ${before}:\n${log.stdout.trim().replace(/^/gm, "  ")}`);
        }
      }
    } catch (e) {
      if (targets.length === 1) throw e;
      failed.push(target.slug);
      ctx.io.warn(`✗ ${target.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed.length) {
    ctx.io.warn(`\nNo se actualizaron: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

/** `secreto`: guarda un secreto del bot escribiéndolo directo en wrangler. */
export async function secretCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const [slug, name] = args.positionals;
  if (!slug || !name || !/^[A-Z][A-Z0-9_]+$/.test(name)) {
    throw new CliError("Uso: pnpm bot secreto <bot> <NOMBRE_DEL_SECRETO>");
  }
  if (!ctx.io.interactive) {
    throw new CliError(
      "Este comando se corre en tu terminal: el secreto lo escribes tú, nadie más lo ve.",
    );
  }
  const bot = pickInstance(ctx.root, slug);
  const w = new Wrangler(ctx, bot.accountId);
  ctx.io.log(`Escribe ${name}: ${SECRET_HELP[name] ?? ""}`);
  if (!(await w.secretPrompt(botPaths(ctx.root, bot.slug).config, name))) {
    throw new CliError(`No se guardó ${name}.`);
  }
  ok(ctx, `Secreto ${name}`, "guardado");
  return 0;
}
