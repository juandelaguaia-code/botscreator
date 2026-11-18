import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

/**
 * Adaptador mínimo de la API de D1 sobre `node:sqlite`, para correr los tests contra el SQL y
 * las migraciones reales sin levantar Cloudflare. Implementa solo lo que usa `D1Store`.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

type Value = SQLInputValue;

function normalize(values: unknown[]): Value[] {
  return values.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v as Value;
  });
}

function isReader(sql: string): boolean {
  const s = sql.trim().toUpperCase();
  return s.startsWith("SELECT") || s.startsWith("WITH") || /\bRETURNING\b/.test(s);
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly values: Value[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, normalize(values));
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.values) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    const rows = this.db.prepare(this.sql).all(...this.values) as T[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: { changes: 0 } };
  }

  async run(): Promise<{ results: never[]; success: true; meta: { changes: number } }> {
    const res = this.db.prepare(this.sql).run(...this.values);
    return { results: [], success: true, meta: { changes: Number(res.changes) } };
  }

  execute(): { results: unknown[]; success: true; meta: { changes: number } } {
    if (isReader(this.sql)) {
      const rows = this.db.prepare(this.sql).all(...this.values);
      return { results: rows.map((r) => ({ ...r })), success: true, meta: { changes: 0 } };
    }
    const res = this.db.prepare(this.sql).run(...this.values);
    return { results: [], success: true, meta: { changes: Number(res.changes) } };
  }
}

export class SqliteD1 {
  readonly raw: DatabaseSync;

  constructor() {
    this.raw = new DatabaseSync(":memory:");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    for (const file of readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      this.raw.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this.raw, sql);
  }

  async batch(statements: Statement[]): Promise<unknown[]> {
    this.raw.exec("BEGIN");
    try {
      const results = statements.map((s) => s.execute());
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }
}

/** Devuelve el adaptador tipado como `D1Database` para inyectarlo en el código de producción. */
export function createTestD1(): D1Database {
  return new SqliteD1() as unknown as D1Database;
}
