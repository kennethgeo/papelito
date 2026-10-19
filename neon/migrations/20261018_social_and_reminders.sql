-- Additive upgrade: existing accounts and exchanges keep their current behavior.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gift_preferences jsonb NOT NULL DEFAULT '{}';
ALTER TABLE exchanges ADD COLUMN IF NOT EXISTS previous_exchange_id uuid REFERENCES exchanges(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exchange_previous ON exchanges(previous_exchange_id);

CREATE TABLE IF NOT EXISTS anonymous_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  from_giver boolean NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_assignment ON anonymous_messages(assignment_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (subscription_id, event_key)
);
