import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const AUTH_SQLITE_MIGRATION_ID = '001_auth_foundation';
const TRAVEL_SQLITE_MIGRATION_ID = '002_travel_trip_persistence';
const LOCATION_DIRECTORY_SQLITE_MIGRATION_ID = '004_location_directory_foundation';
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

const TRAVEL_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS travel_trips (
  account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  id TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  PRIMARY KEY (account_id, id)
) STRICT;

CREATE INDEX IF NOT EXISTS travel_trips_account_updated_idx
  ON travel_trips(account_id, updated_at DESC, id ASC);
`;

const LOCATION_DIRECTORY_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS travel_location_directory_revisions (
  source TEXT NOT NULL CHECK (source = 'geonames'),
  revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 128 AND revision = trim(revision)),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  source_modified_date TEXT NOT NULL CHECK (length(source_modified_date) = 10),
  retrieved_at TEXT NOT NULL CHECK (length(retrieved_at) >= 20),
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  license TEXT NOT NULL CHECK (length(license) BETWEEN 1 AND 80 AND license = trim(license)),
  attribution_url TEXT NOT NULL CHECK (length(attribution_url) BETWEEN 1 AND 240 AND attribution_url LIKE 'https://%'),
  PRIMARY KEY (source, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS travel_location_identities (
  source TEXT NOT NULL CHECK (source = 'geonames'),
  external_source_id TEXT NOT NULL CHECK (length(external_source_id) BETWEEN 1 AND 120 AND external_source_id = trim(external_source_id)),
  location_id TEXT NOT NULL UNIQUE CHECK (
    length(location_id) BETWEEN 18 AND 96 AND location_id LIKE 'arvelis:location:%'
  ),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  PRIMARY KEY (source, external_source_id),
  UNIQUE (source, external_source_id, location_id)
) STRICT;

CREATE TABLE IF NOT EXISTS travel_location_records (
  source TEXT NOT NULL CHECK (source = 'geonames'),
  source_revision TEXT NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 128 AND source_revision = trim(source_revision)),
  external_source_id TEXT NOT NULL CHECK (length(external_source_id) BETWEEN 1 AND 120 AND external_source_id = trim(external_source_id)),
  location_id TEXT NOT NULL CHECK (length(location_id) BETWEEN 18 AND 96 AND location_id LIKE 'arvelis:location:%'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200 AND display_name = trim(display_name)),
  location_type TEXT NOT NULL CHECK (location_type IN ('city', 'station', 'airport')),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  region TEXT CHECK (region IS NULL OR (length(region) BETWEEN 1 AND 120 AND region = trim(region))),
  timezone TEXT CHECK (timezone IS NULL OR (length(timezone) BETWEEN 1 AND 64 AND timezone = trim(timezone))),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  population INTEGER NOT NULL CHECK (population >= 0),
  PRIMARY KEY (source, source_revision, external_source_id),
  FOREIGN KEY (source, source_revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  FOREIGN KEY (source, external_source_id, location_id)
    REFERENCES travel_location_identities(source, external_source_id, location_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX IF NOT EXISTS travel_location_records_filter_idx
  ON travel_location_records(source, source_revision, country_code, location_type, population DESC, external_source_id);

CREATE TABLE IF NOT EXISTS travel_location_names (
  source TEXT NOT NULL CHECK (source = 'geonames'),
  source_revision TEXT NOT NULL,
  external_source_id TEXT NOT NULL,
  normalized_name TEXT NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 400 AND normalized_name = trim(normalized_name)),
  search_name TEXT NOT NULL CHECK (length(search_name) BETWEEN 1 AND 400 AND search_name = trim(search_name)),
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (source, source_revision, external_source_id, normalized_name),
  FOREIGN KEY (source, source_revision, external_source_id)
    REFERENCES travel_location_records(source, source_revision, external_source_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS travel_location_names_exact_lookup_idx
  ON travel_location_names(source, source_revision, normalized_name, external_source_id);
`;

function migrationChecksum(schema: string): string {
  return createHash('sha256').update(schema, 'utf8').digest('hex');
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

function ensureSqliteMigration(database: DatabaseSync, id: string, schema: string): void {
  const checksum = migrationChecksum(schema);
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(id) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== checksum) {
      throw new Error(`ARVELIS SQLite migration checksum mismatch: ${id}`);
    }
    return;
  }

  inSqliteTransaction(database, () => {
    database.exec(schema);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(id, checksum, Date.now());
  });
}

export function ensureSqliteAuthSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
    ) STRICT;
  `);

  ensureSqliteMigration(database, AUTH_SQLITE_MIGRATION_ID, AUTH_SQLITE_SCHEMA);
  ensureSqliteMigration(database, TRAVEL_SQLITE_MIGRATION_ID, TRAVEL_SQLITE_SCHEMA);
  ensureSqliteMigration(database, LOCATION_DIRECTORY_SQLITE_MIGRATION_ID, LOCATION_DIRECTORY_SQLITE_SCHEMA);
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
  return database;
}
