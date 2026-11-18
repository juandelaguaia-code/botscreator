-- Integraciones de negocio (fase 5): agenda, cobros, galería y campañas.

CREATE TABLE appointments (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,           -- calcom
  external_id      TEXT NOT NULL,           -- uid de la reserva en el proveedor
  start_at         INTEGER NOT NULL,
  attendee_name    TEXT,
  status           TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  reminded_at      INTEGER,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_appointments_start ON appointments (start_at);

CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,           -- stripe
  session_id       TEXT NOT NULL UNIQUE,
  concept          TEXT NOT NULL,
  amount           REAL NOT NULL,           -- en la unidad de la moneda (no centavos)
  currency         TEXT NOT NULL,
  url              TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER
);
CREATE INDEX idx_payments_created ON payments (created_at DESC);

CREATE TABLE gallery_items (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,       -- cómo lo pide el bot
  description   TEXT NOT NULL,              -- cuándo usarlo
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'document')),
  content_type  TEXT NOT NULL,
  object_key    TEXT NOT NULL UNIQUE,
  size          INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  message       TEXT NOT NULL,
  segment       TEXT NOT NULL,              -- JSON: { statuses, channels }
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'done')),
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  finished_at   INTEGER
);

CREATE TABLE campaign_sends (
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id    TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  detail        TEXT,
  created_at    INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, contact_id)
);
