import type { AuditEntryDto, TeamUserDto, UserRole } from "@yunque/core";
import { newId } from "../lib/crypto.js";
import { randomToken, sha256 } from "../lib/password.js";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface UserRecord extends TeamUserDto {
  passwordHash: string | null;
  passwordSalt: string | null;
}

function toUser(r: Row): UserRecord {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: String(r.role) as UserRole,
    status: String(r.status) as UserRecord["status"],
    whatsapp: str(r.whatsapp),
    position: str(r.position),
    createdAt: Number(r.created_at),
    lastLoginAt: r.last_login_at === null ? null : Number(r.last_login_at),
    passwordHash: str(r.password_hash),
    passwordSalt: str(r.password_salt),
  };
}

export function publicUser(u: UserRecord): TeamUserDto {
  const { passwordHash: _h, passwordSalt: _s, ...dto } = u;
  return dto;
}

const INVITE_TTL = 7 * 86_400_000;
const RESET_TTL = 3_600_000;

/** Usuarios del panel, links de acceso y bitácora. */
export class TeamStore {
  constructor(
    private readonly db: D1Database,
    private readonly clock: () => number = Date.now,
  ) {}

  async list(): Promise<UserRecord[]> {
    const { results } = await this.db.prepare("SELECT * FROM users ORDER BY created_at").all<Row>();
    return results.map(toUser);
  }

  async get(id: string): Promise<UserRecord | null> {
    const r = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<Row>();
    return r ? toUser(r) : null;
  }

  async byEmail(email: string): Promise<UserRecord | null> {
    const r = await this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .bind(email.toLowerCase())
      .first<Row>();
    return r ? toUser(r) : null;
  }

  async create(input: { name: string; email: string; role: UserRole }): Promise<UserRecord> {
    const r = await this.db
      .prepare(
        "INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
      )
      .bind(newId("usr"), input.email.toLowerCase(), input.name, input.role, this.clock())
      .first<Row>();
    if (!r) throw new Error("No se pudo crear el acceso");
    return toUser(r);
  }

  async update(
    id: string,
    patch: { role?: UserRole; status?: UserRecord["status"]; whatsapp?: string; position?: string },
  ) {
    await this.db
      .prepare(
        `UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status), whatsapp = COALESCE(?, whatsapp),
           position = COALESCE(?, position) WHERE id = ?`,
      )
      .bind(
        patch.role ?? null,
        patch.status ?? null,
        patch.whatsapp ?? null,
        patch.position ?? null,
        id,
      )
      .run();
  }

  async setPassword(id: string, hash: string, salt: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE users SET password_hash = ?, password_salt = ?, status = 'active' WHERE id = ?",
      )
      .bind(hash, salt, id)
      .run();
  }

  async touchLogin(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
      .bind(this.clock(), id)
      .run();
  }

  /** Borra el acceso y suelta sus chats (sin depender de que la base tenga activas las llaves foráneas). */
  async remove(id: string): Promise<boolean> {
    const [, res] = await this.db.batch([
      this.db.prepare("UPDATE conversations SET assigned_to = NULL WHERE assigned_to = ?").bind(id),
      this.db.prepare("DELETE FROM users WHERE id = ?").bind(id),
    ]);
    return (res?.meta.changes ?? 0) > 0;
  }

  /** Crea un link de un solo uso; invalida los anteriores del mismo usuario. Devuelve el token en claro. */
  async issueToken(userId: string, kind: "invite" | "reset"): Promise<string> {
    const token = randomToken();
    const now = this.clock();
    await this.db.batch([
      this.db
        .prepare("UPDATE access_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
        .bind(now, userId),
      this.db
        .prepare(
          "INSERT INTO access_tokens (token_hash, user_id, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          await sha256(token),
          userId,
          kind,
          now + (kind === "invite" ? INVITE_TTL : RESET_TTL),
          now,
        ),
    ]);
    return token;
  }

  /** Busca un link vigente (sin usar ni vencido). */
  async findToken(
    token: string,
  ): Promise<{ user: UserRecord; kind: "invite" | "reset"; hash: string } | null> {
    const hash = await sha256(token);
    const r = await this.db
      .prepare(
        "SELECT * FROM access_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
      )
      .bind(hash, this.clock())
      .first<Row>();
    if (!r) return null;
    const user = await this.get(String(r.user_id));
    if (!user || user.status === "disabled") return null;
    return { user, kind: String(r.kind) as "invite" | "reset", hash };
  }

  async useToken(hash: string): Promise<void> {
    await this.db
      .prepare("UPDATE access_tokens SET used_at = ? WHERE token_hash = ?")
      .bind(this.clock(), hash)
      .run();
  }

  // ---------- bitácora ----------

  async audit(
    actor: { id: string; name: string } | null,
    action: string,
    detail?: string,
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO audit_log (id, actor_id, actor_name, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        newId("aud"),
        actor?.id ?? null,
        actor?.name ?? null,
        action,
        detail?.slice(0, 500) ?? null,
        this.clock(),
      )
      .run();
  }

  async auditLog(limit: number): Promise<AuditEntryDto[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<Row>();
    return results.map((r) => ({
      id: String(r.id),
      actorName: str(r.actor_name),
      action: String(r.action),
      detail: str(r.detail),
      createdAt: Number(r.created_at),
    }));
  }

  async assign(conversationId: string, userId: string | null): Promise<boolean> {
    const res = await this.db
      .prepare("UPDATE conversations SET assigned_to = ? WHERE id = ?")
      .bind(userId, conversationId)
      .run();
    return (res.meta.changes ?? 0) > 0;
  }
}
