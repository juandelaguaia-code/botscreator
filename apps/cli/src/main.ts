#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ParsedArgs, parseArgs } from "./args.ts";
import { deleteCommand, listCommand, pairCommand } from "./commands/agency.ts";
import { doctorCommand } from "./commands/doctor.ts";
import { initCommand } from "./commands/init.ts";
import { installCommand, secretCommand, updateCommand } from "./commands/install.ts";
import { CliError, type Context, consoleIo, spawnRunner } from "./runtime.ts";

type Command = (ctx: Context, args: ParsedArgs) => Promise<number>;

const COMMANDS: Array<{ names: string[]; usage: string; help: string; run: Command }> = [
  {
    names: ["init", "iniciar"],
    usage:
      'init --nombre "Mi negocio" --giro barberia [--slug] [--idioma] [--moneda] [--zona] [--proveedor] [--cuenta]',
    help: "Registra un bot nuevo (no toca Cloudflare todavía)",
    run: initCommand,
  },
  {
    names: ["instalar", "install"],
    usage: "instalar [bot] [--sin-secretos]",
    help: "Crea base, índice y archivos en Cloudflare, despliega y pide los secretos",
    run: installCommand,
  },
  {
    names: ["actualizar", "update"],
    usage: "actualizar [bot] [--todos] [--sin-respaldo]",
    help: "Respaldo, migraciones y despliegue de la versión del repo (conserva la configuración)",
    run: updateCommand,
  },
  {
    names: ["doctor", "diagnostico"],
    usage: "doctor [bot]",
    help: "Revisa tu equipo y la salud de un bot",
    run: doctorCommand,
  },
  {
    names: ["vincular", "pair"],
    usage: "vincular [bot] [--mensualidad 49]",
    help: "Conecta el bot a tu central de agencia (Modo agencia)",
    run: pairCommand,
  },
  {
    names: ["eliminar", "delete"],
    usage: "eliminar <bot> [--confirmar <bot>] [--sin-respaldo]",
    help: "Borra el bot y sus recursos de Cloudflare (con respaldo previo)",
    run: deleteCommand,
  },
  {
    names: ["secreto", "secret"],
    usage: "secreto <bot> <NOMBRE>",
    help: "Guarda un secreto del bot (lo escribes tú, el CLI no lo ve)",
    run: secretCommand,
  },
  { names: ["lista", "list"], usage: "lista", help: "Los bots de este equipo", run: listCommand },
];

function help(ctx: Context): number {
  ctx.io.log("pnpm bot <comando> — instalar y mantener bots en Cloudflare\n");
  for (const c of COMMANDS) ctx.io.log(`  ${c.usage}\n      ${c.help}`);
  ctx.io.log("\nPara operar un bot ya instalado (prompt, leads, conocimiento…): pnpm yunque ayuda");
  return 0;
}

export async function main(argv: string[], ctx: Context): Promise<number> {
  const args = parseArgs(argv);
  if (["ayuda", "help", "--help", "-h"].includes(args.command)) return help(ctx);
  const command = COMMANDS.find((c) => c.names.includes(args.command));
  if (!command) {
    ctx.io.warn(`Comando desconocido: ${args.command}\n`);
    help(ctx);
    return 1;
  }
  try {
    return await command.run(ctx, args);
  } catch (e) {
    if (e instanceof CliError) {
      ctx.io.warn(`✗ ${e.message}`);
      return 1;
    }
    throw e;
  }
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const ctx: Context = {
    root,
    runner: spawnRunner,
    io: consoleIo(),
    fetch: globalThis.fetch,
    env: process.env,
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  process.exitCode = await main(process.argv.slice(2), ctx);
}
