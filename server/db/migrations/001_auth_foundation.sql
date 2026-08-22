CREATE TABLE auth_accounts (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  status text NOT NULL,
  security_version integer NOT NULL DEFAULT 1,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  CONSTRAINT auth_accounts_id_length CHECK (char_length(id) BETWEEN 1 AND 128),
  CONSTRAINT auth_accounts_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 80),
  CONSTRAINT auth_accounts_display_name_trimmed CHECK (display_name = btrim(display_name)),
  CONSTRAINT auth_accounts_status CHECK (status IN ('active', 'suspended', 'pending_deletion', 'deleted')),
  CONSTRAINT auth_accounts_security_version CHECK (security_version >= 0),
  CONSTRAINT auth_accounts_timestamps CHECK (created_at >= 0 AND updated_at >= created_at)
);

CREATE TABLE auth_email_identities (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'email_otp',
  canonical_email text NOT NULL UNIQUE,
  verified_at bigint NOT NULL,
  linked_at bigint NOT NULL,
  last_authenticated_at bigint,
  disabled_at bigint,
  CONSTRAINT auth_email_identities_id_length CHECK (char_length(id) BETWEEN 1 AND 128),
  CONSTRAINT auth_email_identities_kind CHECK (kind = 'email_otp'),
  CONSTRAINT auth_email_identities_email_length CHECK (char_length(canonical_email) BETWEEN 3 AND 254),
  CONSTRAINT auth_email_identities_timestamps CHECK (
    verified_at >= 0
    AND linked_at >= verified_at
    AND (last_authenticated_at IS NULL OR last_authenticated_at >= verified_at)
    AND (disabled_at IS NULL OR disabled_at >= linked_at)
  )
);

CREATE INDEX auth_email_identities_account_idx
  ON auth_email_identities(account_id);

CREATE TABLE auth_email_otp_challenges (
  id char(32) PRIMARY KEY,
  intent text NOT NULL,
  email text NOT NULL,
  code_mac char(64) NOT NULL,
  created_at bigint NOT NULL,
  activated_at bigint,
  expires_at bigint NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  consumed_at bigint,
  superseded_at bigint,
  CONSTRAINT auth_email_otp_challenges_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT auth_email_otp_challenges_intent CHECK (intent IN ('sign_in', 'sign_up')),
  CONSTRAINT auth_email_otp_challenges_email_length CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT auth_email_otp_challenges_mac_format CHECK (code_mac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_email_otp_challenges_attempts CHECK (attempts >= 0 AND max_attempts > 0 AND attempts <= max_attempts),
  CONSTRAINT auth_email_otp_challenges_lifetime CHECK (created_at >= 0 AND expires_at > created_at),
  CONSTRAINT auth_email_otp_challenges_activation CHECK (activated_at IS NULL OR activated_at >= created_at),
  CONSTRAINT auth_email_otp_challenges_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CONSTRAINT auth_email_otp_challenges_superseded CHECK (superseded_at IS NULL OR superseded_at >= created_at)
);

CREATE UNIQUE INDEX auth_email_otp_one_active_idx
  ON auth_email_otp_challenges(email, intent)
  WHERE activated_at IS NOT NULL AND consumed_at IS NULL AND superseded_at IS NULL;

CREATE INDEX auth_email_otp_expiry_idx
  ON auth_email_otp_challenges(expires_at);

CREATE TABLE auth_rate_limits (
  scope text NOT NULL,
  key_hash char(64) NOT NULL,
  window_started_at bigint NOT NULL,
  consumed_count integer NOT NULL,
  expires_at bigint NOT NULL,
  PRIMARY KEY (scope, key_hash),
  CONSTRAINT auth_rate_limits_scope CHECK (scope IN ('start_email', 'start_client', 'verify_challenge', 'verify_client')),
  CONSTRAINT auth_rate_limits_key_format CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_rate_limits_count CHECK (consumed_count >= 0),
  CONSTRAINT auth_rate_limits_window CHECK (window_started_at >= 0 AND expires_at > window_started_at)
);

CREATE INDEX auth_rate_limits_expiry_idx
  ON auth_rate_limits(expires_at);

CREATE TABLE auth_sessions (
  id char(32) PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  secret_mac char(64) NOT NULL,
  security_version integer NOT NULL,
  created_at bigint NOT NULL,
  last_seen_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  revoked_at bigint,
  revoke_reason text,
  device_label text,
  browser_label text,
  CONSTRAINT auth_sessions_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT auth_sessions_secret_mac_format CHECK (secret_mac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT auth_sessions_security_version CHECK (security_version >= 0),
  CONSTRAINT auth_sessions_lifetime CHECK (created_at >= 0 AND last_seen_at >= created_at AND expires_at >= last_seen_at),
  CONSTRAINT auth_sessions_revoke_pair CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT auth_sessions_revoke_reason CHECK (
    revoke_reason IS NULL OR revoke_reason IN ('user_sign_out', 'user_revoke', 'security_change', 'account_disabled', 'expired_cleanup')
  ),
  CONSTRAINT auth_sessions_device_label_length CHECK (device_label IS NULL OR char_length(device_label) <= 120),
  CONSTRAINT auth_sessions_browser_label_length CHECK (browser_label IS NULL OR char_length(browser_label) <= 120)
);

CREATE INDEX auth_sessions_account_last_seen_idx
  ON auth_sessions(account_id, last_seen_at DESC);

CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions(expires_at);

CREATE TABLE auth_security_events (
  id bigserial PRIMARY KEY,
  account_id text REFERENCES auth_accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at bigint NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auth_security_events_type_length CHECK (char_length(event_type) BETWEEN 1 AND 80),
  CONSTRAINT auth_security_events_time CHECK (occurred_at >= 0),
  CONSTRAINT auth_security_events_request_id_length CHECK (request_id IS NULL OR char_length(request_id) <= 128)
);

CREATE INDEX auth_security_events_account_time_idx
  ON auth_security_events(account_id, occurred_at DESC);
