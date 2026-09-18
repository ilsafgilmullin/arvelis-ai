import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { inSqliteTransaction } from './database';

const MIGRATION_ID = '005_location_directory_revision_activation';

const SCHEMA = `
CREATE TABLE travel_location_directory_active_revisions (
  source TEXT NOT NULL CHECK (source = 'geonames'),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 128 AND revision = trim(revision)),
  activated_at TEXT NOT NULL CHECK (length(activated_at) >= 20),
  PRIMARY KEY (source, country_code),
  FOREIGN KEY (source, revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT
) STRICT;

CREATE TABLE travel_location_directory_activation_audit (
  activation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source = 'geonames'),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 128 AND revision = trim(revision)),
  previous_revision TEXT CHECK (previous_revision IS NULL OR (length(previous_revision) BETWEEN 1 AND 128 AND previous_revision = trim(previous_revision))),
  activated_at TEXT NOT NULL CHECK (length(activated_at) >= 20),
  FOREIGN KEY (source, revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  FOREIGN KEY (source, previous_revision)
    REFERENCES travel_location_directory_revisions(source, revision) ON DELETE RESTRICT,
  CHECK (previous_revision IS NULL OR previous_revision <> revision)
) STRICT;

CREATE INDEX travel_location_directory_activation_audit_lookup_idx
  ON travel_location_directory_activation_audit(source, country_code, activation_id DESC);
`;

function checksum(schema: string): string {
  return createHash('sha256').update(schema, 'utf8').digest('hex');
}

export function ensureSqliteLocationDirectoryActivationSchema(database: DatabaseSync): void {
  const expectedChecksum = checksum(SCHEMA);
  const existing = database.prepare(
    'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
  ).get(MIGRATION_ID) as { checksum?: unknown } | undefined;

  if (existing) {
    if (existing.checksum !== expectedChecksum) {
      throw new Error(`ARVELIS SQLite migration checksum mismatch: ${MIGRATION_ID}`);
    }
    return;
  }

  inSqliteTransaction(database, () => {
    database.exec(SCHEMA);
    database.prepare(
      'INSERT INTO auth_schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
    ).run(MIGRATION_ID, expectedChecksum, Date.now());
  });
}
