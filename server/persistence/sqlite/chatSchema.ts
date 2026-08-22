import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const CHAT_SQLITE_MIGRATION_ID = '002_chat_foundation';

const CHAT_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  model_preference TEXT,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
) STRICT;

CREATE INDEX IF NOT EXISTS chat_conversations_account_updated_idx
  ON chat_conversations(account_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'streaming', 'completed', 'failed', 'cancelled')),
  content TEXT NOT NULL CHECK (length(content) <= 12000),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  edited_at INTEGER,
  UNIQUE (conversation_id, position),
  CHECK (edited_at IS NULL OR edited_at >= created_at)
) STRICT;

CREATE INDEX IF NOT EXISTS chat_messages_conversation_position_idx
  ON chat_messages(conversation_id, position ASC);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'file')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 240),
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 180),
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  duration_ms INTEGER,
  storage_state TEXT NOT NULL CHECK (storage_state IN ('pending', 'ready', 'failed')),
  storage_key TEXT,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CHECK ((storage_state = 'ready' AND storage_key IS NOT NULL) OR storage_state <> 'ready')
) STRICT;

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON chat_attachments(message_id, created_at ASC, id ASC);
`;

function migrationChecksum(): string {
  return createHash('sha256').update(CHAT_SQLITE_SCHEMA, 'utf8').digest('hex');
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Preserve the original migration failure.
  }
}

function inMigrationTransaction(database: DatabaseSync, work: () => void): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    work();
    database.exec('COMMIT');
  } catch (error) {
    rollbackQuietly(database);
    throw error;
  }
}

export function ensureSqliteChatSchema(database: DatabaseSync): void {
  const checksum = migrationChecksum();
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(CHAT_SQLITE_MIGRATION_ID) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error('ARVELIS SQLite chat migration checksum mismatch');
    }
    return;
  }

  inMigrationTransaction(database, () => {
    database.exec(CHAT_SQLITE_SCHEMA);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(CHAT_SQLITE_MIGRATION_ID, checksum, Date.now());
  });
}
