import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Context, RunResult } from "./runtime.ts";
import { CliError } from "./runtime.ts";
import { extractJson } from "./text.ts";

/** Sin preguntas ni métricas: el CLI decide y confirma por su cuenta antes de llamar a wrangler. */
const QUIET = { CI: "1", WRANGLER_SEND_METRICS: "false" };

/** Fachada sobre el CLI de Cloudflare (wrangler). Todo lo que toca Cloudflare pasa por aquí. */
export class Wrangler {
  readonly ctx: Context;
  readonly bin: string;
  readonly prefix: string[];
  readonly env: Record<string, string>;

  /** `accountId`: la cuenta de Cloudflare del bot (si la persona tiene acceso a varias). */
  constructor(ctx: Context, accountId: string | null = null) {
    this.ctx = ctx;
    this.env = { ...QUIET, ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}) };
    const local = join(ctx.root, "apps/bot/node_modules/.bin/wrangler");
    this.bin = existsSync(local) ? local : "npx";
    this.prefix = existsSync(local) ? [] : ["wrangler"];
  }

  run(args: string[], input?: string): Promise<RunResult> {
    return this.ctx.runner.run(this.bin, [...this.prefix, ...args], {
      cwd: this.ctx.root,
      env: this.env,
      ...(input !== undefined ? { input } : {}),
    });
  }

  /** Corre un comando que debe salir bien; si falla, explica qué paso falló con el error de wrangler. */
  async must(step: string, args: string[], input?: string): Promise<RunResult> {
    const res = await this.run(args, input);
    if (res.code !== 0) {
      const detail = (res.stderr || res.stdout).trim().split("\n").slice(-4).join("\n");
      throw new CliError(`${step} falló:\n${detail}`);
    }
    return res;
  }

  async whoami(): Promise<{ loggedIn: boolean; detail: string }> {
    const res = await this.run(["whoami"]);
    const out = `${res.stdout}\n${res.stderr}`;
    return {
      loggedIn: res.code === 0 && !/not authenticated|not logged in|wrangler login/i.test(out),
      detail: out.trim(),
    };
  }

  async d1Id(name: string): Promise<string | null> {
    const res = await this.must("Listar bases D1", ["d1", "list", "--json"]);
    const list = extractJson(res.stdout);
    if (!Array.isArray(list)) return null;
    const found = list.find((d: { name?: string }) => d?.name === name) as
      | { uuid?: string }
      | undefined;
    return found?.uuid ?? null;
  }

  async d1Create(name: string): Promise<string> {
    await this.must(`Crear la base ${name}`, ["d1", "create", name]);
    const id = await this.d1Id(name);
    if (!id) throw new CliError(`Se creó la base ${name} pero no pude leer su id.`);
    return id;
  }

  async vectorizeExists(name: string): Promise<boolean> {
    const res = await this.must("Listar índices Vectorize", ["vectorize", "list", "--json"]);
    const list = extractJson(res.stdout);
    return Array.isArray(list) && list.some((i: { name?: string }) => i?.name === name);
  }

  async vectorizeCreate(name: string): Promise<void> {
    // bge-m3 (el modelo de embeddings del bot) produce vectores de 1024 dimensiones
    await this.must(`Crear el índice ${name}`, [
      "vectorize",
      "create",
      name,
      "--dimensions=1024",
      "--metric=cosine",
    ]);
  }

  /** Crea el bucket; si ya existe y es tuyo, sigue sin error. */
  async r2Create(name: string): Promise<"created" | "existing"> {
    const res = await this.run(["r2", "bucket", "create", name]);
    if (res.code === 0) return "created";
    if (/already exists|already own|10004/i.test(`${res.stdout}${res.stderr}`)) return "existing";
    throw new CliError(`Crear el bucket ${name} falló:\n${(res.stderr || res.stdout).trim()}`);
  }

  async migrate(config: string): Promise<void> {
    await this.must("Aplicar migraciones", [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--remote",
      "-c",
      config,
    ]);
  }

  /** Migraciones pendientes en la base remota (`null` si no se pudo consultar). */
  async pendingMigrations(config: string): Promise<number | null> {
    const res = await this.run(["d1", "migrations", "list", "DB", "--remote", "-c", config]);
    if (res.code !== 0) return null;
    if (/no migrations to apply/i.test(res.stdout)) return 0;
    return (res.stdout.match(/\d{4}_[\w-]+\.sql/g) ?? []).length;
  }

  /** Despliega y devuelve la URL pública que reporta wrangler. */
  async deploy(config: string): Promise<string | null> {
    const res = await this.must("Desplegar", ["deploy", "-c", config]);
    return res.stdout.match(/https:\/\/[\w.-]+\.workers\.dev/)?.[0] ?? null;
  }

  async secretNames(config: string): Promise<string[] | null> {
    const res = await this.run(["secret", "list", "--format", "json", "-c", config]);
    if (res.code !== 0) return null;
    const list = extractJson(res.stdout);
    return Array.isArray(list)
      ? list.map((s: { name?: string }) => s?.name).filter((n): n is string => Boolean(n))
      : null;
  }

  /** Guarda un secreto generado por el CLI: va por la entrada estándar, nunca por la pantalla. */
  async secretPutValue(config: string, name: string, value: string): Promise<void> {
    await this.must(`Guardar el secreto ${name}`, ["secret", "put", name, "-c", config], value);
  }

  /** Deja que la persona escriba el secreto directo en wrangler: el CLI nunca lo ve. */
  async secretPrompt(config: string, name: string): Promise<boolean> {
    const res = await this.ctx.runner.run(
      this.bin,
      [...this.prefix, "secret", "put", name, "-c", config],
      {
        cwd: this.ctx.root,
        interactive: true,
        ...(this.env.CLOUDFLARE_ACCOUNT_ID
          ? { env: { CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID } }
          : {}),
      },
    );
    return res.code === 0;
  }

  async exportDb(config: string, database: string, output: string): Promise<void> {
    await this.must("Respaldar la base", [
      "d1",
      "export",
      database,
      "--remote",
      "--output",
      output,
      "-c",
      config,
    ]);
  }

  deleteWorker(config: string) {
    // --force: la confirmación ya la hizo el CLI (escribir el nombre del bot)
    return this.run(["delete", "-c", config, "--force"]);
  }

  deleteDb(name: string) {
    return this.run(["d1", "delete", name, "--skip-confirmation"]);
  }

  deleteIndex(name: string) {
    return this.run(["vectorize", "delete", name, "--force"]);
  }

  deleteBucket(name: string) {
    return this.run(["r2", "bucket", "delete", name]);
  }
}
