#!/usr/bin/env node
/**
 * yunque — CLI de operación del bot para el dueño y para los agentes (skills de Claude Code).
 * Habla con la API del panel (/admin/api), así toda escritura pasa por la misma validación.
 *
 * Conexión (en este orden):
 *   1. Variables de entorno YUNQUE_URL y YUNQUE_PASSWORD
 *   2. apps/bot/.yunque.json  →  { "url": "https://mi-bot.workers.dev", "password": "..." }  (no se sube al repo)
 *   3. http://localhost:8787 con la contraseña de apps/bot/.dev.vars (desarrollo local)
 *
 * Uso: node apps/bot/scripts/yunque.mjs <comando> [args]   ·   `ayuda` lista los comandos.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function devVarsPassword() {
  try {
    const line = readFileSync(join(BOT_DIR, ".dev.vars"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("DASHBOARD_PASSWORD="));
    return line ? line.slice("DASHBOARD_PASSWORD=".length).trim() : null;
  } catch {
    return null;
  }
}

function connection() {
  const file = readJsonFile(join(BOT_DIR, ".yunque.json")) ?? {};
  const url = (process.env.YUNQUE_URL ?? file.url ?? "http://localhost:8787").replace(/\/$/, "");
  const password =
    process.env.YUNQUE_PASSWORD ??
    file.password ??
    (url.includes("localhost") ? devVarsPassword() : null);
  if (!password) {
    fail(
      'Falta la contraseña del panel. Crea apps/bot/.yunque.json con {"url": "...", "password": "..."} ' +
        "o define YUNQUE_URL y YUNQUE_PASSWORD.",
    );
  }
  return { url, password };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

let session = null;

async function api(path, { method = "GET", body, raw = false } = {}) {
  const { url, password } = connection();
  if (!session) {
    const res = await fetch(`${url}/admin/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => fail(`No pude conectar con ${url}. ¿Está desplegado o corriendo \`pnpm dev\`?`));
    if (!res.ok)
      fail(`Login rechazado (${res.status}): ${(await res.json().catch(() => ({}))).error ?? ""}`);
    session = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""])
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  const res = await fetch(`${url}/admin/api${path}`, {
    method,
    headers: { cookie: session, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) {
    if (!res.ok) fail(`Error ${res.status}`);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(data.error ?? `Error ${res.status}`);
  return data;
}

const print = (value) => console.log(JSON.stringify(value, null, 2));
const need = (value, usage) => value ?? fail(`Uso: ${usage}`);

const COMMANDS = {
  ayuda: {
    help: "Lista los comandos",
    run: async () => {
      console.log("yunque — operación del bot\n");
      for (const [name, cmd] of Object.entries(COMMANDS))
        console.log(`  ${name.padEnd(26)} ${cmd.help}`);
    },
  },
  resumen: {
    help: "Números del bot (24 h / 30 días / costo del mes)",
    run: async () => print(await api("/summary")),
  },
  config: {
    help: "Muestra perfil del negocio y ajustes (JSON)",
    run: async () => print(await api("/settings")),
  },
  "config:guardar": {
    help: "<archivo.json> Guarda { profile?, settings? } (validado por el bot)",
    run: async ([file]) => {
      const body =
        readJsonFile(need(file, "config:guardar <archivo.json>")) ??
        fail("El archivo no es JSON válido");
      const saved = await api("/settings", { method: "PUT", body });
      console.log(
        `✓ Guardado. Negocio: ${saved.profile.name} · proveedor: ${saved.settings.provider}`,
      );
    },
  },
  prompt: {
    help: "[canal] Muestra el prompt por secciones (🔒 = bloqueada)",
    run: async ([channel = "web"]) => {
      const p = await api(`/prompt?channel=${channel}`);
      for (const s of p.sections)
        console.log(`\n${s.locked ? "🔒" : "✏️ "} ${s.title}\n${"─".repeat(60)}\n${s.text}`);
      console.log(
        `\n⏱  Parte por mensaje\n${"─".repeat(60)}\n${p.volatile}\n\nTotal estable: ${p.totalChars} caracteres`,
      );
    },
  },
  probar: {
    help: '"<mensaje>" [sesión] Habla con el bot como un cliente (canal Prueba)',
    run: async ([text, sessionId = "cli"]) =>
      print(
        await api("/playground", {
          method: "POST",
          body: { sessionId, text: need(text, 'probar "<mensaje>"') },
        }),
      ),
  },
  conversaciones: {
    help: "[all|needs_human|unread|leads] Lista la bandeja",
    run: async ([filter = "all"]) =>
      print((await api(`/conversations?filter=${filter}`)).conversations),
  },
  conversacion: {
    help: "<id> Muestra un hilo completo",
    run: async ([id]) => print(await api(`/conversations/${need(id, "conversacion <id>")}`)),
  },
  leads: { help: "Lista los leads", run: async () => print((await api("/leads")).leads) },
  tickets: {
    help: "[open|resolved|all] Lista los tickets",
    run: async ([status = "open"]) => print((await api(`/tickets?status=${status}`)).tickets),
  },
  conocimiento: {
    help: "Documentos de la base de conocimiento",
    run: async () => print(await api("/kb")),
  },
  "conocimiento:agregar": {
    help: '"<título>" <archivo.txt|md> Agrega un documento',
    run: async ([title, file]) => {
      const content = readFileSync(need(file, 'conocimiento:agregar "<título>" <archivo>'), "utf8");
      print(
        (
          await api("/kb/documents", {
            method: "POST",
            body: { title: need(title, "título"), content },
          })
        ).document,
      );
    },
  },
  "conocimiento:importar": {
    help: "<url> Importa el texto de una página web",
    run: async ([url]) =>
      print(
        (
          await api("/kb/import-url", {
            method: "POST",
            body: { url: need(url, "conocimiento:importar <url>") },
          })
        ).document,
      ),
  },
  "conocimiento:buscar": {
    help: '"<pregunta>" Prueba qué pasajes encuentra el bot',
    run: async ([query]) =>
      print(
        await api("/kb/search", {
          method: "POST",
          body: { query: need(query, 'conocimiento:buscar "<pregunta>"') },
        }),
      ),
  },
  "conocimiento:borrar": {
    help: "<id> Borra un documento",
    run: async ([id]) =>
      print(
        await api(`/kb/documents/${need(id, "conocimiento:borrar <id>")}`, { method: "DELETE" }),
      ),
  },
  "conocimiento:reindexar": {
    help: "Reindexa todos los documentos",
    run: async () => print(await api("/kb/reindex", { method: "POST" })),
  },
  huecos: {
    help: "[open|resolved|ignored] Radar de huecos (30 días)",
    run: async ([status = "open"]) => print((await api(`/gaps?status=${status}`)).gaps),
  },
  "hueco:responder": {
    help: '<id> "<respuesta>" Tapa un hueco y lo agrega a las FAQ',
    run: async ([id, answer]) =>
      print(
        await api(`/gaps/${need(id, 'hueco:responder <id> "<respuesta>"')}/resolve`, {
          method: "POST",
          body: answer ? { answer } : {},
        }),
      ),
  },
  "hueco:ignorar": {
    help: "<id> Ignora un hueco",
    run: async ([id]) =>
      print(await api(`/gaps/${need(id, "hueco:ignorar <id>")}/ignore`, { method: "POST" })),
  },
  exportar: {
    help: "<leads.csv|leads.json|messages.csv|conversations.json> [salida]",
    run: async ([name, out]) => {
      const allowed = ["leads.csv", "leads.json", "messages.csv", "conversations.json"];
      if (!allowed.includes(name)) fail(`Elige uno de: ${allowed.join(", ")}`);
      const res = await api(`/export/${name}`, { raw: true });
      const target = out ?? `${name.replace(".", `-${new Date().toISOString().slice(0, 10)}.`)}`;
      writeFileSync(target, Buffer.from(await res.arrayBuffer()));
      console.log(`✓ ${target}`);
    },
  },
};

const [name = "ayuda", ...args] = process.argv.slice(2);
const command = COMMANDS[name] ?? fail(`Comando desconocido: ${name}. Usa \`ayuda\`.`);
await command.run(args);
