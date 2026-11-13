-- Papelito — additive migration (2026-11-13): personal links for represented
-- older adults. Compatible with PostgreSQL 15+ / Neon and PGlite.
--
-- represented_kind: who a represented person is. NULL (every existing row)
-- behaves as 'child': the representative can see the assignment, as before.
-- 'senior': the person opens their own papelito with a personal link and the
-- representative cannot see the assignment.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS represented_kind text
  CHECK (represented_kind IS NULL OR represented_kind IN ('child', 'senior'));

-- Personal links. Only the SHA-256 of the token is stored: the link is shown
-- once to the representative, who can create a new one (the previous one stops
-- working). The opening dates are kept so the person can see when the papelito
-- was first opened, even through an earlier link.
CREATE TABLE IF NOT EXISTS represented_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  represented_user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0)
);
-- At most one working link per person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_represented_access_links_active
  ON represented_access_links (represented_user_id)
  WHERE revoked_at IS NULL;
