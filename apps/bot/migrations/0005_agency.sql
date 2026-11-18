-- Modo agencia: bots de clientes que este bot administra como central.
CREATE TABLE agency_clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  niche       TEXT,
  url         TEXT NOT NULL UNIQUE,
  -- token de agencia del bot del cliente (su secreto AGENCY_TOKEN); da acceso de lectura y operación
  token       TEXT NOT NULL,
  monthly_fee REAL,
  notes       TEXT,
  created_at  INTEGER NOT NULL
);
