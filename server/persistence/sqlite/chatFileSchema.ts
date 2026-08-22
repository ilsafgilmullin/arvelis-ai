import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const CHAT_FILE_SQLITE_MIGRATION_ID = '004_chat_file_pipeline';

const CHAT_FILE_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_uploads (
  id TEXT PRIMARY KEY CHECK (length(id) = 32),
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'file')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 240 AND name = trim(name)),
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 180),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  storage_key TEXT NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 1 AND 512),
  sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
  state TEXT NOT NULL CHECK (state IN ('receiving', 'ready')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  CHECK (
    (state = 'receiving' AND sha256 IS NULL)
    OR (state = 'ready' AND sha256 IS NOT NULL)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS chat_uploads_account_expiry_idx
  ON chat_uploads(account_id, expires_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS chat_upload_usage (
  account_id TEXT PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
  upload_count INTEGER NOT NULL CHECK (upload_count >= 0),
  uploaded_bytes INTEGER NOT NULL CHECK (uploaded_bytes >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > window_started_at)
) STRICT;

CREATE INDEX IF NOT EXISTS chat_upload_usage_expiry_idx
  ON chat_upload_usage(expires_at);

CREATE TABLE IF NOT EXISTS chat_storage_gc (
  storage_key TEXT PRIMARY KEY CHECK (length(storage_key) BETWEEN 1 AND 512),
  queued_at INTEGER NOT NULL CHECK (queued_at >= 0),
  reason TEXT NOT NULL CHECK (reason IN ('expired_upload', 'conversation_delete', 'upload_failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at INTEGER,
  CHECK (last_attempt_at IS NULL OR last_attempt_at >= queued_at)
) STRICT;

CREATE INDEX IF NOT EXISTS chat_storage_gc_queue_idx
  ON chat_storage_gc(queued_at ASC, storage_key ASC);
`;

function migrationChecksum(): string {
  return createHash('sha256').update(CHAT_FILE_SQLITE_SCHEMA, 'utf8').digest('hex');
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Preserve the original migration failure.
  }
}

export function ensureSqliteChatFileSchema(database: DatabaseSync): void {
  const checksum = migrationChecksum();
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(CHAT_FILE_SQLITE_MIGRATION_ID) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error('ARVELIS SQLite chat file migration checksum mismatch');
    }
    return;
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(CHAT_FILE_SQLITE_SCHEMA);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(CHAT_FILE_SQLITE_MIGRATION_ID, checksum, Date.now());
    database.exec('COMMIT');
  } catch (error) {
    rollbackQuietly(database);
    throw error;
  }
}
