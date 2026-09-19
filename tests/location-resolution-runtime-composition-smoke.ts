import assert from 'node:assert/strict';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import {
  createRuntimeLocationResolutionService,
  RUNTIME_LOCATION_COUNTRY_CODE,
  RUNTIME_LOCATION_DIRECTORY_ID,
} from '../server/runtime/locationResolutionComposition';
import { ActiveLocationResolutionService } from '../server/travel/activeLocationResolutionService';

async function main(): Promise<void> {
  assert.equal(RUNTIME_LOCATION_DIRECTORY_ID, 'arvelis-geonames-ru');
  assert.equal(RUNTIME_LOCATION_COUNTRY_CODE, 'RU');

  const database = openSqliteAuthDatabase(':memory:');
  try {
    const service = createRuntimeLocationResolutionService({ provider: 'sqlite', database });
    assert.ok(service instanceof ActiveLocationResolutionService);

    const activationMigration = database.prepare(
      "SELECT id FROM auth_schema_migrations WHERE id = '005_location_directory_revision_activation'",
    ).get() as { id?: unknown } | undefined;
    assert.equal(activationMigration?.id, '005_location_directory_revision_activation');

    const activeRows = database.prepare(
      'SELECT COUNT(*) AS count FROM travel_location_directory_active_revisions',
    ).get() as { count?: unknown } | undefined;
    assert.equal(activeRows?.count, 0);
  } finally {
    database.close();
  }

  console.log('location resolution runtime composition smoke: PASS');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
