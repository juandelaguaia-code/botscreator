import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LANGUAGES as CORE_LANGUAGES, GIRO_IDS } from "@yunque/core";
import { beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.ts";
import { GIROS, LANGUAGES } from "../src/catalog.ts";
import { loadInstance } from "../src/instance.ts";
import { main } from "../src/main.ts";
import type { Context, RunOptions, RunResult } from "../src/runtime.ts";
import { extractJson, parseJsonc, slugify } from "../src/text.ts";
import { buildWranglerConfig, readTemplate } from "../src/wrangler-config.ts";

const REPO = resolve(import.meta.dirname, "../../..");

interface Call {
  command: string;
  args: string[];
  options: RunOptions;
}

/**
 * Cloudflare simulado: responde a los comandos de wrangler como lo haría la cuenta real y recuerda lo
 * que se creó, para probar el flujo completo sin tocar la nube.
 */
class FakeCloud {
  loggedIn = true;
  databases: Array<{ name: string; uuid: string }> = [];
  indexes: string[] = [];
  buckets: string[] = [];
  secrets = new Map<string, string>();
  workers: string[] = [];
  pendingMigrations = 0;
  failDeleteBucket = false;
  calls: Call[] = [];

  run = async (command: string, raw: string[], options: RunOptions = {}): Promise<RunResult> => {
    const args = command === "npx" && raw[0] === "wrangler" ? raw.slice(1) : raw;
    this.calls.push({ command, args, options });
    const done = (stdout = ""): RunResult => ({ code: 0, stdout, stderr: "" });
    const fail = (stderr: string): RunResult => ({ code: 1, stdout: "", stderr });
    if (command === "pnpm") return done("✓ built");
    if (command === "git")
      return args[0] === "rev-parse" ? done("abc1234\n") : done("abc1234 Cambio\n");
    const a = args.join(" ");
    if (a === "whoami")
      return this.loggedIn ? done("You are logged in") : fail("You are not authenticated");
    if (a === "d1 list --json") return done(`▲ aviso\n${JSON.stringify(this.databases)}`);
    if (a.startsWith("d1 create ")) {
      this.databases.push({ name: args[2] ?? "", uuid: "11111111-2222-3333-4444-555555555555" });
      return done("✅ Successfully created DB");
    }
    if (a === "vectorize list --json")
      return done(JSON.stringify(this.indexes.map((name) => ({ name }))));
    if (a.startsWith("vectorize create ")) {
      this.indexes.push(args[2] ?? "");
      return done();
    }
    if (a.startsWith("r2 bucket create ")) {
      if (this.buckets.includes(args[3] ?? ""))
        return fail("The bucket you tried to create already exists");
      this.buckets.push(args[3] ?? "");
      return done();
    }
    if (a.startsWith("d1 migrations apply")) return done("✅ migrations applied");
    if (a.startsWith("d1 migrations list"))
      return done(this.pendingMigrations ? "0008_nueva.sql" : "✅ No migrations to apply!");
    if (args[0] === "deploy") {
      const config = JSON.parse(readFileSync(args[2] ?? "", "utf8").replace(/^\/\/.*$/gm, ""));
      this.workers.push(config.name);
      return done(`Uploaded ${config.name}\n  https://${config.name}.agencia.workers.dev\n`);
    }
    if (a.startsWith("secret list"))
      return done(JSON.stringify([...this.secrets.keys()].map((name) => ({ name }))));
    if (a.startsWith("secret put")) {
      this.secrets.set(args[2] ?? "", options.input ?? "(escrito por la persona)");
      return done();
    }
    if (a.startsWith("d1 export")) {
      const out = args[args.indexOf("--output") + 1] ?? "";
      writeFileSync(out, "-- respaldo");
      return done();
    }
    if (args[0] === "delete") return done("Deleted");
    if (a.startsWith("d1 delete")) return done();
    if (a.startsWith("vectorize delete")) return done();
    if (a.startsWith("r2 bucket delete"))
      return this.failDeleteBucket ? fail("bucket is not empty") : done();
    return fail(`comando inesperado: ${a}`);
  };

  wranglerCalls() {
    return this.calls
      .filter((c) => c.command !== "pnpm" && c.command !== "git")
      .map((c) => c.args.join(" "));
  }
}

function makeContext(cloud: FakeCloud, overrides: Partial<Context> = {}) {
  const root = mkdtempSync(join(tmpdir(), "yunque-cli-"));
  mkdirSync(join(root, "apps/bot"), { recursive: true });
  copyFileSync(join(REPO, "apps/bot/wrangler.jsonc"), join(root, "apps/bot/wrangler.jsonc"));
  mkdirSync(join(root, "apps/bot/node_modules/.bin"), { recursive: true });
  writeFileSync(join(root, "apps/bot/node_modules/.bin/wrangler"), "");
  const logs: string[] = [];
  const ctx: Context = {
    root,
    runner: { run: cloud.run },
    io: {
      interactive: false,
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      ask: async (_q, fallback) => fallback ?? "",
    },
    fetch: (async () => Response.json({ ok: true, version: "0.1.0" })) as typeof fetch,
    env: {},
    now: () => new Date("2026-11-18T12:00:00Z"),
    sleep: async () => {},
    ...overrides,
  };
  const run = (...argv: string[]) => main(argv, ctx);
  return { ctx, root, logs, run };
}

describe("utilidades", () => {
  it("lee JSONC con comentarios, comas finales y URLs en texto", () => {
    const value = parseJsonc(`{
      // comentario
      "url": "https://bot.example/admin", /* otro */
      "lista": [1, 2,],
    }`);
    expect(value).toEqual({ url: "https://bot.example/admin", lista: [1, 2] });
  });

  it("arma identificadores aptos para Cloudflare", () => {
    expect(slugify("Barbería Don Pepe")).toBe("barberia-don-pepe");
    expect(slugify("  ¡Café & Pan!  ")).toBe("cafe-pan");
    expect(slugify("Clínica Dental Sonrisas Felices del Norte").length).toBeLessThanOrEqual(24);
  });

  it("encuentra el JSON aunque wrangler imprima avisos antes", () => {
    expect(extractJson('▲ [WARNING] algo\n[{"name":"a"}]\n')).toEqual([{ name: "a" }]);
    expect(extractJson("sin json")).toBeNull();
  });

  it("separa comando, posicionales y opciones", () => {
    expect(
      parseArgs(["init", "--nombre", "Tacos Ana", "--giro=restaurante", "--si", "extra"]),
    ).toEqual({
      command: "init",
      positionals: ["extra"],
      flags: { nombre: "Tacos Ana", giro: "restaurante", si: true },
    });
  });

  it("las listas del CLI coinciden con las del núcleo", () => {
    expect([...GIROS]).toEqual([...GIRO_IDS]);
    expect([...LANGUAGES]).toEqual([...CORE_LANGUAGES]);
  });
});

describe("configuración de wrangler por bot", () => {
  it("deriva de la plantilla real: nombres propios, rutas al repo y variables iniciales", () => {
    const template = readTemplate(REPO);
    const config = buildWranglerConfig(
      template,
      {
        slug: "tacos-ana",
        name: "Tacos Ana",
        giro: "restaurante",
        language: "es-419",
        currency: "$",
        timezone: "America/Mexico_City",
        provider: "anthropic",
        accountId: "cuenta-123",
        resources: {
          worker: "bot-tacos-ana",
          database: "bot-tacos-ana-db",
          databaseId: "abc",
          index: "bot-tacos-ana-kb",
          bucket: "bot-tacos-ana-media",
        },
        url: null,
        pairedWith: null,
        createdAt: "",
        deployedAt: null,
        deployedCommit: null,
      },
      "../../..",
    ) as Record<string, any>;
    const dir = join(REPO, ".yunque/bots/tacos-ana");
    expect(config.name).toBe("bot-tacos-ana");
    expect(config.account_id).toBe("cuenta-123");
    expect(existsSync(resolve(dir, config.main))).toBe(true);
    expect(resolve(dir, config.assets.directory)).toBe(join(REPO, "apps/panel/dist"));
    expect(existsSync(resolve(dir, config.d1_databases[0].migrations_dir))).toBe(true);
    expect(config.d1_databases[0]).toMatchObject({
      database_name: "bot-tacos-ana-db",
      database_id: "abc",
    });
    expect(config.vectorize[0].index_name).toBe("bot-tacos-ana-kb");
    expect(config.r2_buckets[0].bucket_name).toBe("bot-tacos-ana-media");
    expect(config.vars).toMatchObject({
      BOT_NAME: "Tacos Ana",
      BOT_GIRO: "restaurante",
      LLM_PROVIDER: "anthropic",
    });
    expect(config.triggers).toEqual(template.triggers);
    expect(config.env).toBeUndefined();
  });
});

describe("pnpm bot", () => {
  let cloud: FakeCloud;
  beforeEach(() => {
    cloud = new FakeCloud();
  });

  it("init registra el bot sin tocar Cloudflare y no permite duplicados", async () => {
    const { run, root, logs } = makeContext(cloud);
    expect(await run("init", "--nombre", "Barbería Don Pepe", "--giro", "barberia")).toBe(0);
    const bot = loadInstance(root, "barberia-don-pepe");
    expect(bot.resources).toMatchObject({ worker: "bot-barberia-don-pepe", databaseId: null });
    expect(existsSync(join(root, ".yunque/bots/barberia-don-pepe/wrangler.jsonc"))).toBe(true);
    expect(cloud.calls).toHaveLength(0);

    expect(await run("init", "--nombre", "Barbería Don Pepe")).toBe(1);
    expect(logs.at(-1)).toContain("Ya existe");
    expect(await run("init", "--nombre", "Otro", "--giro", "astronauta")).toBe(1);
    expect(logs.at(-1)).toContain("Giro inválido");
  });

  it("instalar crea los recursos, despliega y avisa los secretos que faltan", async () => {
    const { run, root, logs } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana", "--giro", "restaurante");
    expect(await run("instalar", "tacos-ana")).toBe(0);

    expect(cloud.databases.map((d) => d.name)).toEqual(["bot-tacos-ana-db"]);
    expect(cloud.indexes).toEqual(["bot-tacos-ana-kb"]);
    expect(cloud.buckets).toEqual(["bot-tacos-ana-media"]);
    expect(cloud.workers).toEqual(["bot-tacos-ana"]);
    const order = cloud.wranglerCalls().map((c) => c.split(" ").slice(0, 2).join(" "));
    expect(order.indexOf("d1 migrations")).toBeLessThan(order.indexOf("deploy -c"));

    const bot = loadInstance(root, "tacos-ana");
    expect(bot.resources.databaseId).toBe("11111111-2222-3333-4444-555555555555");
    expect(bot.url).toBe("https://bot-tacos-ana.agencia.workers.dev");
    expect(bot.deployedCommit).toBe("abc1234");
    const config = readFileSync(join(root, ".yunque/bots/tacos-ana/wrangler.jsonc"), "utf8");
    expect(config).toContain('"PUBLIC_URL": "https://bot-tacos-ana.agencia.workers.dev"');
    // sin terminal interactiva no pide secretos: explica cómo guardarlos
    expect(cloud.secrets.size).toBe(0);
    expect(logs.join("\n")).toContain("pnpm bot secreto tacos-ana DASHBOARD_PASSWORD");
    expect(logs.join("\n")).toContain("pnpm bot secreto tacos-ana ANTHROPIC_API_KEY");

    // repetir no duplica nada
    expect(await run("instalar", "tacos-ana")).toBe(0);
    expect(cloud.databases).toHaveLength(1);
    expect(cloud.indexes).toHaveLength(1);
  });

  it("instalar se detiene antes de crear nada si no hay sesión de Cloudflare", async () => {
    cloud.loggedIn = false;
    const { run, logs } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    expect(await run("instalar")).toBe(1);
    expect(logs.at(-1)).toContain("wrangler login");
    expect(cloud.wranglerCalls()).toEqual(["whoami"]);
  });

  it("actualizar respalda primero y conserva base e identidad del bot", async () => {
    const { run, root } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    await run("instalar");
    cloud.calls = [];
    expect(await run("actualizar", "tacos-ana")).toBe(0);
    const calls = cloud.wranglerCalls();
    const exportAt = calls.findIndex((c) => c.startsWith("d1 export bot-tacos-ana-db --remote"));
    expect(exportAt).toBeGreaterThanOrEqual(0);
    expect(exportAt).toBeLessThan(calls.findIndex((c) => c.startsWith("deploy")));
    expect(existsSync(join(root, ".yunque/respaldos/tacos-ana-2026-11-18-12-00-00.sql"))).toBe(
      true,
    );
    expect(cloud.databases).toHaveLength(1);
    expect(loadInstance(root, "tacos-ana").resources.databaseId).toBe(
      "11111111-2222-3333-4444-555555555555",
    );
  });

  it("actualizar --todos sigue con los demás si uno falla", async () => {
    const { run, ctx } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    await run("init", "--nombre", "Spa Luz", "--giro", "spa");
    await run("instalar", "tacos-ana");
    await run("instalar", "spa-luz");
    ctx.runner = {
      run: async (command, args, options) =>
        args.join(" ").startsWith("d1 export bot-tacos-ana-db")
          ? { code: 1, stdout: "", stderr: "falló la exportación" }
          : cloud.run(command, args, options),
    };
    cloud.workers = [];
    expect(await run("actualizar", "--todos")).toBe(1);
    expect(cloud.workers).toEqual(["bot-spa-luz"]);
  });

  it("doctor revisa salud, secretos y migraciones del bot", async () => {
    const { run, logs } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    await run("instalar");
    logs.length = 0;
    expect(await run("doctor", "tacos-ana")).toBe(1);
    const report = logs.join("\n");
    expect(report).toContain(
      "✓ Responde en https://bot-tacos-ana.agencia.workers.dev (versión 0.1.0)",
    );
    expect(report).toContain("✗ Secreto DASHBOARD_PASSWORD");

    cloud.secrets.set("DASHBOARD_PASSWORD", "x");
    cloud.secrets.set("ANTHROPIC_API_KEY", "x");
    cloud.pendingMigrations = 1;
    logs.length = 0;
    expect(await run("doctor", "tacos-ana")).toBe(0);
    expect(logs.join("\n")).toContain("! 1 migración(es) pendiente(s)");
  });

  it("vincular guarda el token en el bot y lo registra en la central sin mostrarlo", async () => {
    const central: Array<{ url: string; init: RequestInit }> = [];
    let botToken = "";
    const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      central.push({ url, init });
      if (url.endsWith("/healthz")) return Response.json({ ok: true });
      if (url === "https://central.example/admin/api/login")
        return new Response("{}", { headers: { "set-cookie": "sesion=1; HttpOnly" } });
      if (url.startsWith("https://bot-tacos-ana")) {
        const auth = new Headers(init.headers).get("authorization");
        return auth === `Bearer ${botToken}`
          ? Response.json({})
          : new Response("{}", { status: 401 });
      }
      if (url.endsWith("/agency/clients") && !init.method) return Response.json({ clients: [] });
      if (url.endsWith("/agency/clients") && init.method === "POST")
        return Response.json({}, { status: 201 });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    const { run, root, logs, ctx } = makeContext(cloud, {
      fetch: fakeFetch,
      env: { YUNQUE_URL: "https://central.example", YUNQUE_PASSWORD: "clave-central" },
    });
    await run("init", "--nombre", "Tacos Ana");
    await run("instalar");
    const original = cloud.run;
    ctx.runner = {
      run: async (command, args, options) => {
        const res = await original(command, args, options);
        if (args.join(" ").startsWith("secret put AGENCY_TOKEN")) botToken = options?.input ?? "";
        return res;
      },
    };

    expect(await run("vincular", "tacos-ana", "--mensualidad", "49")).toBe(0);
    expect(botToken).toMatch(/^[0-9a-f]{64}$/);
    const register = central.find(
      (c) => c.init.method === "POST" && c.url.endsWith("/agency/clients"),
    );
    expect(JSON.parse(String(register?.init.body))).toMatchObject({
      name: "Tacos Ana",
      url: "https://bot-tacos-ana.agencia.workers.dev",
      token: botToken,
      monthlyFee: 49,
    });
    expect(new Headers(register?.init.headers).get("cookie")).toBe("sesion=1");
    expect(logs.join("\n")).not.toContain(botToken);
    expect(JSON.stringify(loadInstance(root, "tacos-ana"))).not.toContain(botToken);
    expect(loadInstance(root, "tacos-ana").pairedWith).toBe("https://central.example");
  });

  it("eliminar exige confirmación, respalda y borra todo", async () => {
    const { run, root, logs } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    await run("instalar");
    cloud.calls = [];

    expect(await run("eliminar", "tacos-ana")).toBe(1);
    expect(logs.at(-1)).toContain("No se borró nada");
    expect(await run("eliminar", "tacos-ana", "--confirmar", "otro-bot")).toBe(1);
    expect(cloud.calls).toHaveLength(0);

    expect(await run("eliminar", "tacos-ana", "--confirmar", "tacos-ana")).toBe(0);
    const calls = cloud.wranglerCalls();
    expect(calls.findIndex((c) => c.startsWith("d1 export"))).toBeLessThan(
      calls.findIndex((c) => c.startsWith("delete")),
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^delete -c .*--force$/),
        "d1 delete bot-tacos-ana-db --skip-confirmation",
        "vectorize delete bot-tacos-ana-kb --force",
        "r2 bucket delete bot-tacos-ana-media",
      ]),
    );
    expect(existsSync(join(root, ".yunque/bots/tacos-ana"))).toBe(false);
    expect(existsSync(join(root, ".yunque/respaldos/tacos-ana-2026-11-18-12-00-00.sql"))).toBe(
      true,
    );
  });

  it("eliminar conserva los datos locales si algo no se pudo borrar", async () => {
    cloud.failDeleteBucket = true;
    const { run, root, logs } = makeContext(cloud);
    await run("init", "--nombre", "Tacos Ana");
    await run("instalar");
    expect(await run("eliminar", "tacos-ana", "--confirmar", "tacos-ana")).toBe(1);
    expect(logs.join("\n")).toContain("No se pudo borrar Archivos");
    expect(existsSync(join(root, ".yunque/bots/tacos-ana/bot.json"))).toBe(true);
  });
});
