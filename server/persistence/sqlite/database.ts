import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureSqliteChatFileSchema } from './chatFileSchema';
import { ensureSqliteChatRateLimitSchema } from './chatRateLimitSchema';
import { ensureSqliteChatSchema } from './chatSchema';

const AUTH_SQLITE_MIGRATION_ID = '001_auth_foundation';
const AUTH_SQLITE_DATA_ROOT = resolve('.data');

const AUTH_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'pending_deletion', 'deleted')),
  security_version INTEGER NOT NULL CHECK (security_version >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE IF NOT EXISTS auth_email_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind = 'email_otp'),
  canonical_email TEXT NOT NULL UNIQUE,
  verified_at INTEGER NOT NULL CHECK (verified_at >= 0),
  linked_at INTEGER NOT NULL CHECK (linked_at >= 0),
  last_authenticated_at INTEGER,
  disabled_at INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS auth_email_identities_account_idx
  ON auth_email_identities(account_id, linked_at);

CREATE TABLE IF NOT EXISTS auth_email_otp_challenges (
  id TEXT PRIMARY KEY,
  intent TEXT NOT NULL CHECK (intent IN ('sign_in', 'sign_up')),
  email TEXT NOT NULL,
  code_mac TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  activated_at INTEGER,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
  consumed_at INTEGER,
  superseded_at INTEGER
) STRICT;

CREATE INDEX IF NOT EXISTS auth_email_otp_active_idx
  ON auth_email_otp_challenges(email, intent, activated_at)
  WHERE activated_at IS NOT NULL AND consumed_at IS NULL AND superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
  consumed_count INTEGER NOT NULL CHECK (consumed_count >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= window_started_at),
  PRIMARY KEY (scope, key_hash)
) STRICT;

CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx
  ON auth_rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  secret_mac TEXT NOT NULL,
  security_version INTEGER NOT NULL CHECK (security_version >= 1),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= created_at),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  revoked_at INTEGER,
  revoke_reason TEXT CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'user_sign_out', 'user_revoke', 'security_change', 'account_disabled', 'expired_cleanup'
    )
  ),
  device_label TEXT,
  browser_label TEXT,
  CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL))
) STRICT;

CREATE INDEX IF NOT EXISTS auth_sessions_account_active_idx
  ON auth_sessions(account_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  metadata_json TEXT
) STRICT;
`;

function migrationChecksum(): string {
  return createHash('sha256').update(AUTH_SQLITE_SCHEMA, 'utf8').digest('hex');
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // Preserve the original migration or transaction failure.
  }
}

function resolveSafeSqliteLocation(location: string): string {
  const trimmed = location.trim();
  if (!trimmed || trimmed.includes('\0')) throw new Error('Invalid AUTH_SQLITE_PATH');
  if (trimmed === ':memory:') return trimmed;

  const candidate = resolve(trimmed);
  const relativePath = relative(AUTH_SQLITE_DATA_ROOT, candidate);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('AUTH_SQLITE_PATH must point to a file inside .data/');
  }
  return candidate;
}

export function inSqliteTransaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    rollbackQuietly(database);
    throw error;
  }
}

export function ensureSqliteAuthSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
    ) STRICT;
  `);

  const checksum = migrationChecksum();
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(AUTH_SQLITE_MIGRATION_ID) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error('ARVELIS SQLite auth migration checksum mismatch');
    }
    return;
  }

  inSqliteTransaction(database, () => {
    database.exec(AUTH_SQLITE_SCHEMA);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(AUTH_SQLITE_MIGRATION_ID, checksum, Date.now());
  });
}

export function openSqliteAuthDatabase(location: string): DatabaseSync {
  const databaseLocation = resolveSafeSqliteLocation(location);
  if (databaseLocation !== ':memory:') mkdirSync(dirname(databaseLocation), { recursive: true });

  const database = new DatabaseSync(databaseLocation);
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA busy_timeout = 5000;');
  if (databaseLocation !== ':memory:') database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA synchronous = NORMAL;');
  ensureSqliteAuthSchema(database);
  ensureSqliteChatSchema(database);
  ensureSqliteChatRateLimitSchema(database);
  ensureSqliteChatFileSchema(database);
  return database;
}
