-- Papelito — Neon PostgreSQL Initial Migration
-- Compatible with Neon Serverless Postgres (PG 15+) and Managed Better Auth
-- Note: gen_random_uuid() is built-in since PostgreSQL 13.

-- 1. Profiles Table (syncs user public metadata, identified by Better Auth user.id text)
CREATE TABLE IF NOT EXISTS profiles (
  user_id text PRIMARY KEY,
  alias text NOT NULL,
  full_name text NOT NULL,
  avatar_color text NOT NULL DEFAULT '#46245D',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Legal Consent Audit Records (Ley 8968 Costa Rica)
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  ip_address text,
  user_agent text
);

-- 3. Exchanges (Gift Exchange Groups)
CREATE TABLE IF NOT EXISTS exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id text NOT NULL REFERENCES profiles(user_id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  registration_deadline date NOT NULL,
  budget_amount numeric(12,2) NOT NULL CHECK (budget_amount > 0),
  currency text NOT NULL CHECK (currency IN ('CRC', 'USD')),
  suggested_theme text NOT NULL CHECK (suggested_theme IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  selected_theme text NOT NULL CHECK (selected_theme IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  manual_theme_override text CHECK (manual_theme_override IS NULL OR manual_theme_override IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  requires_approval boolean NOT NULL DEFAULT true,
  min_participants integer NOT NULL DEFAULT 3 CHECK (min_participants >= 3),
  status text NOT NULL DEFAULT 'inscripcion_abierta' CHECK (status IN ('borrador', 'inscripcion_abierta', 'inscripcion_cerrada', 'sorteado', 'finalizado', 'cancelado')),
  current_draw_version integer NOT NULL DEFAULT 0 CHECK (current_draw_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Single-use or Multi-use Cryptographic Invitation Links
-- Stores SHA-256 token_hash for lookup and server-encrypted token for organizer recovery (never plaintext token)
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  encrypted_token text NOT NULL,
  max_uses integer NOT NULL DEFAULT 100 CHECK (max_uses > 0),
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Memberships (Participants in an Exchange)
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  is_organizer boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by text REFERENCES profiles(user_id) ON DELETE SET NULL,
  CONSTRAINT unique_member_exchange UNIQUE (exchange_id, user_id)
);

-- 6. Organizer Exclusions (Preventing specific pairs, e.g. partners or siblings)
CREATE TABLE IF NOT EXISTS exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  giver_user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  receiver_user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_exclusion UNIQUE (exchange_id, giver_user_id, receiver_user_id),
  CONSTRAINT no_self_exclusion CHECK (giver_user_id <> receiver_user_id)
);

-- 7. Draw Versions (History of draws for an exchange)
CREATE TABLE IF NOT EXISTS draw_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  invalidation_reason text,
  CONSTRAINT unique_exchange_version UNIQUE (exchange_id, version_number)
);

-- 8. Secret Santa Assignments (Protected pairs per draw version)
CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  draw_version_id uuid NOT NULL REFERENCES draw_versions(id) ON DELETE CASCADE,
  giver_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  receiver_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  revealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_draw_giver UNIQUE (draw_version_id, giver_id),
  CONSTRAINT unique_draw_receiver UNIQUE (draw_version_id, receiver_id),
  CONSTRAINT no_self_assignment CHECK (giver_id <> receiver_id)
);

-- 9. User Wishlist Pool
CREATE TABLE IF NOT EXISTS wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  url text,
  approximate_price numeric(12,2),
  currency text NOT NULL DEFAULT 'CRC' CHECK (currency IN ('CRC', 'USD')),
  priority text NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baja')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Wish Selections per Event (Which wishes are shared in which exchange)
CREATE TABLE IF NOT EXISTS wish_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  wish_id uuid NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_exchange_wish UNIQUE (exchange_id, wish_id)
);

-- 11. Gift Purchases (Secret Giver marks a receiver's wish as purchased)
CREATE TABLE IF NOT EXISTS gift_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id uuid NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  wish_id uuid NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  buyer_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_exchange_wish_buyer UNIQUE (exchange_id, wish_id, buyer_id)
);

-- 12. ARCO Privacy Requests (Export and Delete records)
CREATE TABLE IF NOT EXISTS privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('export', 'delete')),
  notes text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'completed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Indexes for performance and query isolation
CREATE INDEX IF NOT EXISTS idx_consent_records_user ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_exchange ON invitations(exchange_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_exchange ON memberships(exchange_id);
CREATE INDEX IF NOT EXISTS idx_assignments_draw_giver ON assignments(draw_version_id, giver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_draw_receiver ON assignments(draw_version_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_wish_selections_exchange ON wish_selections(exchange_id);
CREATE INDEX IF NOT EXISTS idx_wish_selections_user ON wish_selections(user_id);
CREATE INDEX IF NOT EXISTS idx_gift_purchases_exchange ON gift_purchases(exchange_id, buyer_id);
