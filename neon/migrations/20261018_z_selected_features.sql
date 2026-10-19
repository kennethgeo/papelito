ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guardian_user_id text REFERENCES profiles(user_id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS represented_exchange_id uuid REFERENCES exchanges(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preview_checked_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS representation_authorized_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_guardian ON profiles(guardian_user_id, represented_exchange_id);

CREATE TABLE IF NOT EXISTS budget_polls (
  exchange_id uuid PRIMARY KEY REFERENCES exchanges(id) ON DELETE CASCADE,
  options jsonb NOT NULL,
  closed_at timestamptz,
  chosen_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS budget_votes (
  exchange_id uuid NOT NULL REFERENCES budget_polls(exchange_id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (exchange_id, user_id)
);
CREATE TABLE IF NOT EXISTS app_locks (name text PRIMARY KEY);
INSERT INTO app_locks(name) VALUES ('wish-photos'), ('webauthn-challenges') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS wish_photos (
  wish_id uuid PRIMARY KEY REFERENCES wishes(id) ON DELETE CASCADE,
  image bytea NOT NULL CHECK (octet_length(image) <= 131072),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
  area text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON support_reports(user_id, created_at);
CREATE TABLE IF NOT EXISTS app_passkeys (
  credential_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports jsonb NOT NULL DEFAULT '[]',
  rp_id text NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON app_passkeys(user_id);
CREATE TABLE IF NOT EXISTS app_passkey_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  credential_id text NOT NULL REFERENCES app_passkeys(credential_id) ON DELETE CASCADE,
  browser text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  token_hash text PRIMARY KEY,
  challenge text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('registration', 'authentication')),
  user_id text REFERENCES profiles(user_id) ON DELETE CASCADE,
  origin text NOT NULL,
  rp_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes'
);
CREATE TABLE IF NOT EXISTS app_session_revocations (
  session_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
