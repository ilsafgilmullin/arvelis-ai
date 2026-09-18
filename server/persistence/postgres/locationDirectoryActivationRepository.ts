import type { Pool, PoolClient } from 'pg';
import type {
  ActivateLocationDirectoryRevisionV1,
  ActiveLocationDirectoryRevisionV1,
  LocationDirectoryActivationRepository,
} from '../../travel/locationDirectoryActivation';
import type { LocationDirectoryRevisionV1, LocationDirectorySourceV1 } from '../../travel/locationDirectoryFoundation';
import { PostgresLocationDirectoryRepository } from './locationDirectoryRepository';

type ActiveRow = { source: string; country_code: string; revision: string; activated_at: Date | string };

function toActive(row: ActiveRow, previousRevision: string | null): ActiveLocationDirectoryRevisionV1 {
  const activatedAt = row.activated_at instanceof Date ? row.activated_at.toISOString() : new Date(row.activated_at).toISOString();
  return { version: 1, source: row.source as LocationDirectorySourceV1, countryCode: row.country_code, revision: row.revision, activatedAt, previousRevision };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
}

export class PostgresLocationDirectoryActivationRepository implements LocationDirectoryActivationRepository {
  readonly #directory: PostgresLocationDirectoryRepository;
  constructor(private readonly pool: Pool) { this.#directory = new PostgresLocationDirectoryRepository(pool); }

  getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    return this.#directory.getRevision(source, revision);
  }

  async getActive(source: LocationDirectorySourceV1, countryCode: string): Promise<ActiveLocationDirectoryRevisionV1 | null> {
    const result = await this.pool.query<ActiveRow>(`
      SELECT source, country_code, revision, activated_at
      FROM travel_location_directory_active_revisions
      WHERE source = $1 AND country_code = $2 LIMIT 1
    `, [source, countryCode]);
    const row = result.rows[0];
    return row ? toActive(row, null) : null;
  }

  async activate(input: ActivateLocationDirectoryRevisionV1): Promise<ActiveLocationDirectoryRevisionV1> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query<ActiveRow>(`
        SELECT source, country_code, revision, activated_at
        FROM travel_location_directory_active_revisions
        WHERE source = $1 AND country_code = $2
        FOR UPDATE
      `, [input.source, input.countryCode]);
      const current = currentResult.rows[0] ?? null;
      const currentRevision = current?.revision ?? null;
      if (currentRevision !== input.expectedCurrentRevision) throw new Error('Location directory active revision changed');
      if (currentRevision === input.revision) throw new Error('Location directory revision is already active');

      const revision = await client.query<{ country_code: string }>(`
        SELECT country_code FROM travel_location_directory_revisions
        WHERE source = $1 AND revision = $2 LIMIT 1
      `, [input.source, input.revision]);
      if (revision.rowCount !== 1) throw new Error('Location directory revision is not registered');
      if (revision.rows[0]?.country_code !== input.countryCode) throw new Error('Location directory revision country mismatch');

      const upserted = await client.query<ActiveRow>(`
        INSERT INTO travel_location_directory_active_revisions (source, country_code, revision, activated_at)
        VALUES ($1, $2, $3, $4::timestamptz)
        ON CONFLICT (source, country_code) DO UPDATE SET revision = EXCLUDED.revision, activated_at = EXCLUDED.activated_at
        RETURNING source, country_code, revision, activated_at
      `, [input.source, input.countryCode, input.revision, input.activatedAt]);
      await client.query(`
        INSERT INTO travel_location_directory_activation_audit
          (source, country_code, revision, previous_revision, activated_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
      `, [input.source, input.countryCode, input.revision, currentRevision, input.activatedAt]);
      await client.query('COMMIT');
      const row = upserted.rows[0];
      if (!row) throw new Error('Location directory activation write failed');
      return toActive(row, currentRevision);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally { client.release(); }
  }
}
