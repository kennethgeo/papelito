CREATE TABLE IF NOT EXISTS exchange_organization (
  exchange_id uuid PRIMARY KEY REFERENCES exchanges(id) ON DELETE CASCADE,
  capacity integer NOT NULL DEFAULT 100 CHECK (capacity BETWEEN 3 AND 100),
  rules text NOT NULL DEFAULT '' CHECK (length(rules) <= 1500),
  rules_version integer NOT NULL DEFAULT 1 CHECK (rules_version > 0),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exchange_attendance (
  exchange_id uuid NOT NULL,
  user_id text NOT NULL,
  response text NOT NULL CHECK (response IN ('yes', 'maybe', 'no')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_id, user_id),
  FOREIGN KEY (exchange_id, user_id) REFERENCES memberships(exchange_id, user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS exchange_waitlist (
  exchange_id uuid NOT NULL,
  user_id text NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_id, user_id),
  FOREIGN KEY (exchange_id, user_id) REFERENCES memberships(exchange_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_exchange_waitlist_order ON exchange_waitlist(exchange_id, queued_at, user_id);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS rules_read_version integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS rules_read_at timestamptz;
