-- Equipo de agencia: hasta 3 accesos personales con permiso sobre Modo agencia (editar o solo lectura).
ALTER TABLE users ADD COLUMN agency_access TEXT CHECK (agency_access IN ('edit', 'read'));
