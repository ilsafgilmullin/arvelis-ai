import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const migrations = [
  ['001_auth_foundation', 'server/db/migrations/001_auth_foundation.sql'],
  ['002_travel_trip_persistence', 'server/db/migrations/002_travel_trip_persistence.sql'],
];
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured. Add it only to protected environment/secrets before running migrations.');
}

const pool = new Pool({ connectionString, max: 2, application_name: 'arvelis-db-migrate' });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1)', [21082026]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS arvelis_schema_migrations (
      id text PRIMARY KEY,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const [migrationId, relativePath] of migrations) {
    const sql = await readFile(resolve(relativePath), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'SELECT checksum FROM arvelis_schema_migrations WHERE id = $1',
      [migrationId],
    );

    if (existing.rowCount === 1) {
      const storedChecksum = existing.rows[0]?.checksum;
      if (storedChecksum !== checksum) {
        throw new Error(`Migration ${migrationId} was already applied with a different checksum.`);
      }
      console.log(`ARVELIS DB migration ${migrationId}: already applied`);
      continue;
    }

    await client.query(sql);
    await client.query(
      'INSERT INTO arvelis_schema_migrations (id, checksum) VALUES ($1, $2)',
      [migrationId, checksum],
    );
    console.log(`ARVELIS DB migration ${migrationId}: applied`);
  }

  await client.query('COMMIT');
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original migration failure.
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
