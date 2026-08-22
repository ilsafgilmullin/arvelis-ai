CREATE TABLE IF NOT EXISTS chat_rate_limits (
  scope text NOT NULL,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  window_started_at bigint NOT NULL,
  consumed_count integer NOT NULL,
  expires_at bigint NOT NULL,
  PRIMARY KEY (scope, account_id),
  CONSTRAINT chat_rate_limits_scope CHECK (scope IN ('create', 'mutation')),
  CONSTRAINT chat_rate_limits_window CHECK (
    window_started_at >= 0
    AND consumed_count >= 0
    AND expires_at > window_started_at
  )
);

CREATE INDEX IF NOT EXISTS chat_rate_limits_expiry_idx
  ON chat_rate_limits(expires_at);
