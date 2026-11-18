-- Equipo (fase 7): accesos personales con rol, invitaciones, recuperación y bitácora.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'team')),
  password_hash  TEXT,                 -- PBKDF2-SHA256 en base64
  password_salt  TEXT,
  whatsapp       TEXT,
  position       TEXT,
  status         TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER
);

-- Links de un solo uso: invitación (7 días) o recuperación de contraseña (1 hora). Se guarda el hash.
CREATE TABLE access_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT,
  actor_name  TEXT,
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log (created_at DESC);

ALTER TABLE conversations ADD COLUMN assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL;
