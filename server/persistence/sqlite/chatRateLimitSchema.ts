import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const CHAT_RATE_LIMIT_SQLITE_MIGRATION_ID = '003_chat_rate_limits';

const CHAT_RATE_LIMIT_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_rate_limits (
  scope TEXT NOT NULL CHECK (scope IN ('create', 'mutation')),
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
  window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
  consumed_count INTEGER NOT NULL CHECK (consumed_count >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > window_started_at),
  PRIMARY KEY (scope, account_id)
) STRICT;

CREATE INDEX IF NOT EXISTS chat_rate_limits_expiry_idx
  ON chat_rate_limits(expires_at);
`;

function migrationChecksum(): string {
  return createHash('sha256').update(CHAT_RATE_LIMIT_SQLITE_SCHEMA, 'utf8').digest('hex');
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Preserve the original migration failure.
  }
}

export function ensureSqliteChatRateLimitSchema(database: DatabaseSync): void {
  const checksum = migrationChecksum();
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(CHAT_RATE_LIMIT_SQLITE_MIGRATION_ID) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error('ARVELIS SQLite chat rate-limit migration checksum mismatch');
    }
    return;
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(CHAT_RATE_LIMIT_SQLITE_SCHEMA);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(CHAT_RATE_LIMIT_SQLITE_MIGRATION_ID, checksum, Date.now());
    database.exec('COMMIT');
  } catch (error) {
    rollbackQuietly(database);
    throw error;
  }
}
