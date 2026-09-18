import assert from 'node:assert/strict';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import { SqliteLocationDirectoryActivationRepository } from '../server/persistence/sqlite/locationDirectoryActivationRepository';
import { SqliteLocationDirectoryRepository } from '../server/persistence/sqlite/locationDirectoryRepository';
import { LocationDirectoryActivationService } from '../server/travel/locationDirectoryActivation';
import { LocationDirectoryIngestionService, type LocationDirectoryRevisionV1 } from '../server/travel/locationDirectoryFoundation';

function revision(name: string, fingerprint: string): LocationDirectoryRevisionV1 {
  return {
    version: 1,
    source: 'geonames',
    revision: name,
    countryCode: 'RU',
    sourceModifiedDate: '2026-09-18',
    retrievedAt: '2026-09-18T06:00:00.000Z',
    sourceFingerprint: fingerprint.repeat(64),
    license: 'CC-BY-4.0',
    attributionUrl: 'https://www.geonames.org/',
  };
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');
  try {
    const directory = new SqliteLocationDirectoryRepository(database);
    const ingestion = new LocationDirectoryIngestionService(directory);
    const first = revision('geonames:RU:sqlite-activation:v1', '5');
    const second = revision('geonames:RU:sqlite-activation:v2', '6');
    await ingestion.registerRevision(first);
    await ingestion.registerRevision(second);

    const repository = new SqliteLocationDirectoryActivationRepository(database);
    const service = new LocationDirectoryActivationService(repository);
    const migration = database.prepare(
      "SELECT id FROM auth_schema_migrations WHERE id = '005_location_directory_revision_activation'",
    ).get() as { id?: unknown } | undefined;
    assert.equal(migration?.id, '005_location_directory_revision_activation');

    const activatedFirst = await service.activate({
      source: 'geonames', countryCode: 'RU', revision: first.revision,
      expectedCurrentRevision: null, activatedAt: '2026-09-18T07:00:00.000Z',
    });
    assert.equal(activatedFirst.previousRevision, null);

    await assert.rejects(service.activate({
      source: 'geonames', countryCode: 'RU', revision: second.revision,
      expectedCurrentRevision: null, activatedAt: '2026-09-18T07:01:00.000Z',
    }), /active revision changed/);

    const activatedSecond = await service.activate({
      source: 'geonames', countryCode: 'RU', revision: second.revision,
      expectedCurrentRevision: first.revision, activatedAt: '2026-09-18T07:02:00.000Z',
    });
    assert.equal(activatedSecond.previousRevision, first.revision);
    assert.equal((await repository.getActive('geonames', 'RU'))?.revision, second.revision);

    const audit = database.prepare(`
      SELECT revision, previous_revision FROM travel_location_directory_activation_audit
      WHERE source = 'geonames' AND country_code = 'RU' ORDER BY activation_id
    `).all() as Array<{ revision: string; previous_revision: string | null }>;
    assert.deepEqual(audit, [
      { revision: first.revision, previous_revision: null },
      { revision: second.revision, previous_revision: first.revision },
    ]);

    console.log('Location Directory SQLite Activation Persistence V1: PASS');
  } finally {
    database.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
