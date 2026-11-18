-- Superpoderes automáticos (fase 4): Vigilante, Cazador, encuestas, reseñas y no-shows.

ALTER TABLE conversations ADD COLUMN closed_at INTEGER;
-- Memoria del cliente que deja el Vigilante para la próxima conversación.
ALTER TABLE contacts ADD COLUMN memory TEXT;

-- Análisis del Vigilante, uno por conversación cerrada.
CREATE TABLE conversation_insights (
  conversation_id         TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  rating                  INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  sentiment               TEXT NOT NULL CHECK (sentiment IN ('positivo', 'neutral', 'negativo')),
  resolved_without_human  INTEGER NOT NULL,
  open_sale               INTEGER NOT NULL,
  upset                   INTEGER NOT NULL,
  intent                  TEXT,
  objection               TEXT,
  unanswered_question     TEXT,
  summary                 TEXT NOT NULL,
  model                   TEXT,
  created_at              INTEGER NOT NULL
);
CREATE INDEX idx_insights_created ON conversation_insights (created_at DESC);

-- Mensajes que el bot inicia por su cuenta. Los índices únicos son las garantías escritas en la base:
-- un solo toque del Cazador y una sola encuesta por conversación; una sola invitación a reseña y un
-- solo rescate de no-show por cliente.
CREATE TABLE outreach (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('cazador', 'encuesta', 'no_show', 'resena', 'campana')),
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  detail           TEXT,
  created_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_outreach_per_conversation ON outreach (conversation_id, kind) WHERE kind IN ('cazador', 'encuesta');
CREATE UNIQUE INDEX uq_outreach_per_contact ON outreach (contact_id, kind) WHERE kind IN ('resena', 'no_show');
CREATE INDEX idx_outreach_kind_created ON outreach (kind, created_at);

CREATE TABLE survey_responses (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id       TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_survey_created ON survey_responses (created_at DESC);
