import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  /** Texto para la entrada estándar (p. ej. un secreto generado, que así nunca aparece en pantalla). */
  input?: string;
  env?: Record<string, string>;
  /** Conecta el comando a la terminal: la persona escribe directo en él (p. ej. `wrangler secret put`). */
  interactive?: boolean;
}

/** Ejecuta programas externos. Los tests usan uno falso que registra cada llamada. */
export interface Runner {
  run(command: string, args: string[], options?: RunOptions): Promise<RunResult>;
}

/** Entrada y salida con la persona. */
export interface Io {
  readonly interactive: boolean;
  log(message: string): void;
  warn(message: string): void;
  ask(question: string, fallback?: string): Promise<string>;
}

/** Todo lo que un comando necesita del mundo exterior, inyectable para probarlo. */
export interface Context {
  root: string;
  runner: Runner;
  io: Io;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export class CliError extends Error {}

export const spawnRunner: Runner = {
  run(command, args, options = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: options.interactive ? "inherit" : ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      child.on("error", (e) => resolve({ code: 127, stdout, stderr: String(e) }));
      child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
      if (!options.interactive) {
        if (options.input !== undefined) child.stdin?.write(options.input);
        child.stdin?.end();
      }
    });
  },
};

export function consoleIo(): Io {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    interactive,
    log: (m) => console.log(m),
    warn: (m) => console.warn(m),
    async ask(question, fallback) {
      if (!interactive) return fallback ?? "";
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(fallback ? `${question} (${fallback}): ` : `${question}: `);
      rl.close();
      return answer.trim() || fallback || "";
    },
  };
}
