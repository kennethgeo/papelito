-- Papelito — additive migration (2026-11-02): idempotent creation.
-- Compatible with PostgreSQL 15+ / Neon and PGlite. Adds nullable columns and
-- partial unique indexes only: existing rows keep NULL and are not touched.
-- Code that predates this migration ignores the new columns, so a code
-- rollback does not require reverting it.

-- A client-generated id per creation attempt. Retrying the same attempt
-- (uncertain network outcome) returns the row already created.
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchanges_client_request
  ON exchanges (organizer_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

ALTER TABLE wishes ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wishes_client_request
  ON wishes (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Per-account wish quota and listings filter by owner; the foreign key had no index.
CREATE INDEX IF NOT EXISTS idx_wishes_user ON wishes (user_id);
-- Active-exchange quota per organizer.
CREATE INDEX IF NOT EXISTS idx_exchanges_organizer_status ON exchanges (organizer_id, status);
