import type { DatabaseSync } from 'node:sqlite';
import type { Pool } from 'pg';
import { PostgresLocationDirectoryActivationRepository } from '../persistence/postgres/locationDirectoryActivationRepository';
import { PostgresLocationDirectoryRepository } from '../persistence/postgres/locationDirectoryRepository';
import { SqliteLocationDirectoryActivationRepository } from '../persistence/sqlite/locationDirectoryActivationRepository';
import { SqliteLocationDirectoryRepository } from '../persistence/sqlite/locationDirectoryRepository';
import { ActiveLocationResolutionService } from '../travel/activeLocationResolutionService';

export const RUNTIME_LOCATION_DIRECTORY_ID = 'arvelis-geonames-ru';
export const RUNTIME_LOCATION_COUNTRY_CODE = 'RU';

export type RuntimeLocationPersistence =
  | { provider: 'postgres'; pool: Pool }
  | { provider: 'sqlite'; database: DatabaseSync };

/**
 * Builds the runtime resolver over the same persistence connection used by the server.
 * This function never imports or activates a directory revision. If no revision has been
 * explicitly activated, ActiveLocationResolutionService fails closed at request time.
 */
export function createRuntimeLocationResolutionService(
  persistence: RuntimeLocationPersistence,
): ActiveLocationResolutionService {
  if (persistence.provider === 'postgres') {
    const directory = new PostgresLocationDirectoryRepository(persistence.pool);
    const activation = new PostgresLocationDirectoryActivationRepository(persistence.pool);
    return new ActiveLocationResolutionService(directory, activation, {
      directoryId: RUNTIME_LOCATION_DIRECTORY_ID,
      source: 'geonames',
      countryCode: RUNTIME_LOCATION_COUNTRY_CODE,
    });
  }

  const directory = new SqliteLocationDirectoryRepository(persistence.database);
  const activation = new SqliteLocationDirectoryActivationRepository(persistence.database);
  return new ActiveLocationResolutionService(directory, activation, {
    directoryId: RUNTIME_LOCATION_DIRECTORY_ID,
    source: 'geonames',
    countryCode: RUNTIME_LOCATION_COUNTRY_CODE,
  });
}
