CREATE TABLE IF NOT EXISTS chat_uploads (
  id char(32) PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_ms bigint,
  storage_key text NOT NULL UNIQUE,
  sha256 char(64),
  state text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  CONSTRAINT chat_uploads_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT chat_uploads_kind CHECK (kind IN ('image', 'video', 'audio', 'file')),
  CONSTRAINT chat_uploads_name_length CHECK (char_length(name) BETWEEN 1 AND 240),
  CONSTRAINT chat_uploads_name_trimmed CHECK (name = btrim(name)),
  CONSTRAINT chat_uploads_mime_type_length CHECK (char_length(mime_type) BETWEEN 1 AND 180),
  CONSTRAINT chat_uploads_size CHECK (size_bytes > 0),
  CONSTRAINT chat_uploads_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT chat_uploads_storage_key_length CHECK (char_length(storage_key) BETWEEN 1 AND 512),
  CONSTRAINT chat_uploads_sha256_format CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chat_uploads_state CHECK (state IN ('receiving', 'ready')),
  CONSTRAINT chat_uploads_ready_hash CHECK (
    (state = 'receiving' AND sha256 IS NULL)
    OR (state = 'ready' AND sha256 IS NOT NULL)
  ),
  CONSTRAINT chat_uploads_lifetime CHECK (created_at >= 0 AND expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS chat_uploads_account_expiry_idx
  ON chat_uploads(account_id, expires_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS chat_upload_usage (
  account_id text PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  window_started_at bigint NOT NULL,
  upload_count integer NOT NULL,
  uploaded_bytes bigint NOT NULL,
  expires_at bigint NOT NULL,
  CONSTRAINT chat_upload_usage_values CHECK (
    window_started_at >= 0
    AND upload_count >= 0
    AND uploaded_bytes >= 0
    AND expires_at > window_started_at
  )
);

CREATE INDEX IF NOT EXISTS chat_upload_usage_expiry_idx
  ON chat_upload_usage(expires_at);

CREATE TABLE IF NOT EXISTS chat_storage_gc (
  storage_key text PRIMARY KEY,
  queued_at bigint NOT NULL,
  reason text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at bigint,
  CONSTRAINT chat_storage_gc_key_length CHECK (char_length(storage_key) BETWEEN 1 AND 512),
  CONSTRAINT chat_storage_gc_reason CHECK (reason IN ('expired_upload', 'conversation_delete', 'upload_failed')),
  CONSTRAINT chat_storage_gc_attempts CHECK (attempts >= 0),
  CONSTRAINT chat_storage_gc_timestamps CHECK (
    queued_at >= 0
    AND (last_attempt_at IS NULL OR last_attempt_at >= queued_at)
  )
);

CREATE INDEX IF NOT EXISTS chat_storage_gc_queue_idx
  ON chat_storage_gc(queued_at ASC, storage_key ASC);
