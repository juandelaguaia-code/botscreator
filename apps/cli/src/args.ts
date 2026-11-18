export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | true>;
}

/** Opciones que no llevan valor (para no confundirlas con `--opcion valor`). */
const BOOLEAN_FLAGS = new Set(["si", "sin-secretos", "sin-respaldo", "todos", "ayuda", "help"]);

/** `instalar mi-bot --giro barberia --sin-secretos` → comando, posicionales y opciones. */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "ayuda", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (
      BOOLEAN_FLAGS.has(body) ||
      rest[i + 1] === undefined ||
      rest[i + 1]?.startsWith("--")
    ) {
      flags[body] = true;
    } else {
      flags[body] = rest[i + 1] ?? "";
      i++;
    }
  }
  return { command, positionals, flags };
}
