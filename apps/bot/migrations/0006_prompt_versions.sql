-- Historial del cerebro del bot: cada guardado deja la versión anterior para poder deshacer.
CREATE TABLE prompt_versions (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  profile     TEXT NOT NULL,          -- JSON del perfil completo en ese momento
  author      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_prompt_versions_created ON prompt_versions (created_at DESC);
