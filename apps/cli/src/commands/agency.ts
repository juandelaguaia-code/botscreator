import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import type { ParsedArgs } from "../args.ts";
import { botPaths, listInstances, loadInstance, pickInstance, saveInstance } from "../instance.ts";
import { CliError, type Context } from "../runtime.ts";
import { backup, centralSession, ok, readCentral, requireLogin } from "../steps.ts";
import { Wrangler } from "../wrangler.ts";
import { isPlaceholderId } from "../wrangler-config.ts";

interface CentralClient {
  id: string;
  url: string;
}

/**
 * `vincular`: conecta un bot a tu central de agencia (Modo agencia). Genera un token nuevo, lo guarda
 * como secreto AGENCY_TOKEN del bot y lo registra en la central. El token nunca se muestra ni se guarda
 * en disco: viaja directo de un lado al otro.
 */
export async function pairCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const bot = pickInstance(ctx.root, args.positionals[0]);
  if (!bot.url) throw new CliError(`Primero instala el bot: pnpm bot instalar ${bot.slug}`);
  const central = readCentral(ctx);
  if (!central) {
    throw new CliError(
      'Falta la conexión con tu central. Crea apps/bot/.yunque.json con { "url", "password" } de tu central (o usa YUNQUE_URL y YUNQUE_PASSWORD).',
    );
  }
  if (central.url === bot.url) throw new CliError("Un bot no se puede vincular consigo mismo.");

  const w = new Wrangler(ctx, bot.accountId);
  await requireLogin(ctx, w);
  const api = await centralSession(ctx, central);
  ok(ctx, "Central de agencia", central.url);

  const token = randomBytes(32).toString("hex");
  await w.secretPutValue(botPaths(ctx.root, bot.slug).config, "AGENCY_TOKEN", token);
  ok(ctx, "Token de agencia guardado en el bot");

  // el secreto tarda unos segundos en propagarse: esperamos a que el bot lo acepte
  let accepted = false;
  for (let attempt = 0; attempt < 10 && !accepted; attempt++) {
    if (attempt > 0) await ctx.sleep(3000);
    const res = await ctx
      .fetch(`${bot.url}/admin/api/summary`, { headers: { authorization: `Bearer ${token}` } })
      .catch(() => null);
    accepted = Boolean(res?.ok);
  }
  if (!accepted)
    throw new CliError("El bot todavía no acepta el token. Espera un minuto y repite el comando.");

  const { body } = await api<{ clients?: CentralClient[] }>("/agency/clients");
  const existing = body.clients?.find((c) => c.url.replace(/\/$/, "") === bot.url);
  const fee =
    typeof args.flags.mensualidad === "string" ? Number(args.flags.mensualidad) : undefined;
  const res = existing
    ? await api(`/agency/clients/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ token, ...(fee !== undefined ? { monthlyFee: fee } : {}) }),
      })
    : await api("/agency/clients", {
        method: "POST",
        body: JSON.stringify({
          name: bot.name,
          niche: bot.giro,
          url: bot.url,
          token,
          ...(fee !== undefined ? { monthlyFee: fee } : {}),
        }),
      });
  if (res.status >= 300) {
    const error = (res.body as { error?: string }).error ?? `error ${res.status}`;
    throw new CliError(`La central no aceptó el bot: ${error}`);
  }
  saveInstance(ctx.root, { ...bot, pairedWith: central.url });
  ok(ctx, existing ? "Vínculo renovado en la central" : "Bot agregado al portafolio de la central");
  return 0;
}

/**
 * `eliminar`: borra el bot y todos sus recursos de Cloudflare, con respaldo previo de la base. Pide
 * escribir el identificador del bot para confirmar (o `--confirmar <bot>` sin terminal interactiva).
 */
export async function deleteCommand(ctx: Context, args: ParsedArgs): Promise<number> {
  const slug = args.positionals[0];
  if (!slug) throw new CliError("Uso: pnpm bot eliminar <bot>");
  const bot = loadInstance(ctx.root, slug);
  const confirmation =
    typeof args.flags.confirmar === "string"
      ? args.flags.confirmar
      : ctx.io.interactive
        ? await ctx.io.ask(
            `Esto borra el Worker, la base, el índice y los archivos de "${bot.name}". Escribe ${slug} para confirmar`,
          )
        : "";
  if (confirmation !== slug) {
    throw new CliError(
      `No se borró nada. Para confirmar escribe exactamente "${slug}" (o usa --confirmar ${slug}).`,
    );
  }

  const w = new Wrangler(ctx, bot.accountId);
  const installed = !isPlaceholderId(bot.resources.databaseId);
  if (installed) {
    await requireLogin(ctx, w);
    if (!args.flags["sin-respaldo"]) await backup(ctx, w, bot);

    const config = botPaths(ctx.root, slug).config;
    const steps: Array<[string, () => ReturnType<Wrangler["run"]>, string]> = [
      ["Worker", () => w.deleteWorker(config), "Workers & Pages en el panel de Cloudflare"],
      ["Base de datos", () => w.deleteDb(bot.resources.database), "Storage & Databases → D1"],
      ["Índice de conocimiento", () => w.deleteIndex(bot.resources.index), "AI → Vectorize"],
      ["Archivos", () => w.deleteBucket(bot.resources.bucket), "R2 (vacía el bucket y bórralo)"],
    ];
    const pending: string[] = [];
    for (const [what, run, where] of steps) {
      const res = await run();
      const gone =
        res.code === 0 ||
        /not found|does not exist|10007|could not find/i.test(`${res.stdout}${res.stderr}`);
      if (gone) ok(ctx, `${what} borrado`);
      else {
        pending.push(what);
        ctx.io.warn(`! No se pudo borrar ${what}. Bórralo a mano en ${where}.`);
      }
    }
    if (pending.length) {
      ctx.io.warn(
        `\nQuedó pendiente: ${pending.join(", ")}. Sus datos locales se conservan para reintentar.`,
      );
      return 1;
    }
  }

  if (bot.pairedWith) {
    const central = readCentral(ctx);
    if (central?.url === bot.pairedWith && bot.url) {
      try {
        const api = await centralSession(ctx, central);
        const { body } = await api<{ clients?: CentralClient[] }>("/agency/clients");
        const entry = body.clients?.find((c) => c.url.replace(/\/$/, "") === bot.url);
        if (entry) await api(`/agency/clients/${entry.id}`, { method: "DELETE" });
        ok(ctx, "Quitado del portafolio de la central");
      } catch {
        ctx.io.warn(`! Quítalo a mano del Modo agencia de ${bot.pairedWith}.`);
      }
    } else ctx.io.warn(`! Quítalo del Modo agencia de ${bot.pairedWith}.`);
  }

  const { dir } = botPaths(ctx.root, slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  ok(
    ctx,
    `Bot "${bot.name}" eliminado`,
    installed ? "el respaldo queda en .yunque/respaldos/" : "",
  );
  return 0;
}

/** `lista`: los bots de este equipo. */
export async function listCommand(ctx: Context): Promise<number> {
  const bots = listInstances(ctx.root);
  if (!bots.length) {
    ctx.io.log("Todavía no hay bots. Crea uno con: pnpm bot init");
    return 0;
  }
  for (const b of bots) {
    const state = isPlaceholderId(b.resources.databaseId)
      ? "sin instalar"
      : b.deployedAt
        ? `desplegado ${b.deployedAt.slice(0, 10)}`
        : "instalado";
    ctx.io.log(
      `${b.slug.padEnd(24)} ${b.name} · ${b.giro} · ${state}${b.url ? ` · ${b.url}` : ""}`,
    );
  }
  return 0;
}
