-- Esquema inicial del bot. Tiempos en milisegundos desde epoch (UTC).

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,           -- JSON
  updated_at  INTEGER NOT NULL
);

CREATE TABLE contacts (
  id           TEXT PRIMARY KEY,
  channel      TEXT NOT NULL,
  external_id  TEXT NOT NULL,
  name         TEXT,
  phone        TEXT,
  email        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (channel, external_id)
);

CREATE TABLE conversations (
  id                        TEXT PRIMARY KEY,
  contact_id                TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel                   TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  needs_human               INTEGER NOT NULL DEFAULT 0,
  paused_until              INTEGER,  -- humano al mando hasta este momento (NULL = bot activo)
  unread                    INTEGER NOT NULL DEFAULT 0,
  last_message_at           INTEGER NOT NULL,
  last_message_preview      TEXT,
  last_customer_message_at  INTEGER,
  created_at                INTEGER NOT NULL
);
CREATE INDEX idx_conversations_contact ON conversations (contact_id, channel, status);
CREATE INDEX idx_conversations_last ON conversations (last_message_at DESC);

CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'human', 'note')),
  content          TEXT NOT NULL,
  meta             TEXT,              -- JSON: modelo, herramientas, autor…
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_created ON messages (created_at);

CREATE TABLE leads (
  id               TEXT PRIMARY KEY,
  contact_id       TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  name             TEXT,
  phone            TEXT,
  email            TEXT,
  interest         TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'contactado', 'ganado', 'perdido')),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_leads_created ON leads (created_at DESC);

CREATE TABLE tickets (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('handoff', 'knowledge_gap', 'system')),
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at       INTEGER NOT NULL,
  resolved_at      INTEGER
);
CREATE INDEX idx_tickets_status ON tickets (status, created_at DESC);

CREATE TABLE llm_usage (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL,
  output_tokens       INTEGER NOT NULL,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd            REAL NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL
);
CREATE INDEX idx_usage_created ON llm_usage (created_at);

CREATE TABLE login_attempts (
  key           TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,
  updated_at    INTEGER NOT NULL
);
