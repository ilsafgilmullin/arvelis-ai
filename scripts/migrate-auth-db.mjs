import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const migrations = [
  { id: '001_auth_foundation', path: resolve('server/db/migrations/001_auth_foundation.sql') },
  { id: '002_chat_foundation', path: resolve('server/db/migrations/002_chat_foundation.sql') },
  { id: '003_chat_rate_limits', path: resolve('server/db/migrations/003_chat_rate_limits.sql') },
  { id: '004_chat_file_pipeline', path: resolve('server/db/migrations/004_chat_file_pipeline.sql') },
];

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured. Add it only to protected environment/secrets before running migrations.');
}

const pool = new Pool({ connectionString, max: 2, application_name: 'arvelis-migrate' });
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

  for (const migration of migrations) {
    const sql = await readFile(migration.path, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query(
      'SELECT checksum FROM arvelis_schema_migrations WHERE id = $1',
      [migration.id],
    );

    if (existing.rowCount === 1) {
      const storedChecksum = existing.rows[0]?.checksum;
      if (storedChecksum !== checksum) {
        throw new Error(`Migration ${migration.id} was already applied with a different checksum.`);
      }
      console.log(`ARVELIS DB migration ${migration.id}: already applied`);
      continue;
    }

    await client.query(sql);
    await client.query(
      'INSERT INTO arvelis_schema_migrations (id, checksum) VALUES ($1, $2)',
      [migration.id, checksum],
    );
    console.log(`ARVELIS DB migration ${migration.id}: applied`);
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
