-- Base de conocimiento y radar de huecos (fase 2).

CREATE TABLE kb_documents (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  source           TEXT NOT NULL CHECK (source IN ('manual', 'url')),
  source_url       TEXT,
  content          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'error')),
  error            TEXT,
  chunk_count      INTEGER NOT NULL DEFAULT 0,
  embedding_model  TEXT,              -- motor con el que se indexó (para detectar reindexado)
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE kb_chunks (
  id               TEXT PRIMARY KEY,  -- también es el id del vector en Vectorize
  document_id      TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  ord              INTEGER NOT NULL,
  content          TEXT NOT NULL,
  embedding_model  TEXT NOT NULL,
  embedding        TEXT,              -- JSON; solo lo usa el índice local (sin Vectorize)
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_kb_chunks_document ON kb_chunks (document_id, ord);
CREATE INDEX idx_kb_chunks_model ON kb_chunks (embedding_model);

CREATE TABLE knowledge_gaps (
  id               TEXT PRIMARY KEY,
  question         TEXT NOT NULL,
  normalized       TEXT NOT NULL,
  embedding        TEXT,              -- JSON, para agrupar dudas parecidas
  embedding_model  TEXT,
  source           TEXT NOT NULL CHECK (source IN ('kb_miss', 'verifier', 'handoff')),
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  hits             INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolution       TEXT,
  first_seen_at    INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  resolved_at      INTEGER
);
CREATE INDEX idx_gaps_status ON knowledge_gaps (status, last_seen_at DESC);
