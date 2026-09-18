import type { DatabaseSync } from 'node:sqlite';
import type {
  ActivateLocationDirectoryRevisionV1,
  ActiveLocationDirectoryRevisionV1,
  LocationDirectoryActivationRepository,
} from '../../travel/locationDirectoryActivation';
import type { LocationDirectoryRevisionV1, LocationDirectorySourceV1 } from '../../travel/locationDirectoryFoundation';
import { inSqliteTransaction } from './database';
import { ensureSqliteLocationDirectoryActivationSchema } from './locationDirectoryActivationSchema';
import { SqliteLocationDirectoryRepository } from './locationDirectoryRepository';

type ActiveRow = { source?: unknown; country_code?: unknown; revision?: unknown; activated_at?: unknown };

function parseActive(row: ActiveRow | undefined, previousRevision: string | null): ActiveLocationDirectoryRevisionV1 | null {
  if (!row || row.source !== 'geonames' || typeof row.country_code !== 'string' || typeof row.revision !== 'string' || typeof row.activated_at !== 'string') return null;
  const parsed = new Date(row.activated_at);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== row.activated_at) return null;
  return { version: 1, source: 'geonames', countryCode: row.country_code, revision: row.revision, activatedAt: row.activated_at, previousRevision };
}

export class SqliteLocationDirectoryActivationRepository implements LocationDirectoryActivationRepository {
  readonly #directory: SqliteLocationDirectoryRepository;
  constructor(private readonly database: DatabaseSync) {
    ensureSqliteLocationDirectoryActivationSchema(database);
    this.#directory = new SqliteLocationDirectoryRepository(database);
  }

  getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    return this.#directory.getRevision(source, revision);
  }

  async getActive(source: LocationDirectorySourceV1, countryCode: string): Promise<ActiveLocationDirectoryRevisionV1 | null> {
    const row = this.database.prepare(`
      SELECT source, country_code, revision, activated_at
      FROM travel_location_directory_active_revisions
      WHERE source = ? AND country_code = ? LIMIT 1
    `).get(source, countryCode) as ActiveRow | undefined;
    if (!row) return null;
    const parsed = parseActive(row, null);
    if (!parsed) throw new Error('Invalid persisted location directory activation');
    return parsed;
  }

  async activate(input: ActivateLocationDirectoryRevisionV1): Promise<ActiveLocationDirectoryRevisionV1> {
    return inSqliteTransaction(this.database, () => {
      const current = this.database.prepare(`
        SELECT source, country_code, revision, activated_at
        FROM travel_location_directory_active_revisions
        WHERE source = ? AND country_code = ? LIMIT 1
      `).get(input.source, input.countryCode) as ActiveRow | undefined;
      const currentRevision = typeof current?.revision === 'string' ? current.revision : null;
      if (currentRevision !== input.expectedCurrentRevision) throw new Error('Location directory active revision changed');
      if (currentRevision === input.revision) throw new Error('Location directory revision is already active');

      const target = this.database.prepare(`
        SELECT country_code FROM travel_location_directory_revisions
        WHERE source = ? AND revision = ? LIMIT 1
      `).get(input.source, input.revision) as { country_code?: unknown } | undefined;
      if (!target) throw new Error('Location directory revision is not registered');
      if (target.country_code !== input.countryCode) throw new Error('Location directory revision country mismatch');

      this.database.prepare(`
        INSERT INTO travel_location_directory_active_revisions (source, country_code, revision, activated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source, country_code) DO UPDATE SET revision = excluded.revision, activated_at = excluded.activated_at
      `).run(input.source, input.countryCode, input.revision, input.activatedAt);
      this.database.prepare(`
        INSERT INTO travel_location_directory_activation_audit
          (source, country_code, revision, previous_revision, activated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.source, input.countryCode, input.revision, currentRevision, input.activatedAt);

      return { version: 1, source: input.source, countryCode: input.countryCode, revision: input.revision, activatedAt: input.activatedAt, previousRevision: currentRevision };
    });
  }
}
