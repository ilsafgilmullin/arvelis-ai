import assert from 'node:assert/strict';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import { SqliteLocationDirectoryRepository } from '../server/persistence/sqlite/locationDirectoryRepository';
import {
  LocationDirectoryIngestionService,
  RepositoryTravelLocationDirectory,
  normalizeLocationDirectoryName,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySourceLocationV1,
} from '../server/travel/locationDirectoryFoundation';
import { LocationResolutionService } from '../server/travel/locationResolutionService';

const REVISION: LocationDirectoryRevisionV1 = {
  version: 1,
  source: 'geonames',
  revision: 'geonames:RU:sqlite-smoke:v1',
  countryCode: 'RU',
  sourceModifiedDate: '2026-09-17',
  retrievedAt: '2026-09-17T12:00:00.000Z',
  sourceFingerprint: '1'.repeat(64),
  license: 'CC-BY-4.0',
  attributionUrl: 'https://www.geonames.org/',
};

function location(overrides: Partial<LocationDirectorySourceLocationV1> = {}): LocationDirectorySourceLocationV1 {
  return {
    version: 1,
    source: 'geonames',
    sourceRevision: REVISION.revision,
    externalSourceId: '524901',
    displayName: 'Москва',
    searchNames: ['Москва', 'Moscow'],
    type: 'city',
    countryCode: 'RU',
    region: 'Москва',
    timezone: 'Europe/Moscow',
    latitude: 55.75222,
    longitude: 37.61556,
    population: 13_000_000,
    ...overrides,
  };
}

function context() {
  return {
    accountScopeId: 'sqlite-location-smoke',
    requestId: 'sqlite-location-request',
    signal: new AbortController().signal,
  };
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');
  try {
    const migration = database.prepare(`
      SELECT id
      FROM auth_schema_migrations
      WHERE id = '004_location_directory_foundation'
    `).get() as { id?: unknown } | undefined;
    assert.equal(migration?.id, '004_location_directory_foundation');

    const repository = new SqliteLocationDirectoryRepository(database);
    let idCounter = 1;
    const ingestion = new LocationDirectoryIngestionService(repository, {
      locationIdFactory: () => `arvelis:location:sqlite-${idCounter++}`,
    });
    await ingestion.registerRevision(REVISION);

    const moscow = await ingestion.upsert(location());
    assert.equal(moscow.locationId, 'arvelis:location:sqlite-1');

    await ingestion.upsert(location({
      externalSourceId: '900001',
      displayName: 'Москва-Сити',
      searchNames: ['Москва-Сити', 'Москва', 'Moscow City'],
      population: 20_000_000,
    }));

    const directory = new RepositoryTravelLocationDirectory(repository, {
      id: 'sqlite-geonames-ru',
      source: 'geonames',
      revision: REVISION.revision,
    });
    const resolver = new LocationResolutionService(directory);
    const ambiguous = await resolver.resolve({
      version: 1,
      rawLabel: 'Москва',
      locale: 'ru-RU',
      countryCode: 'RU',
      limit: 5,
    }, context());
    assert.equal(ambiguous.status, 'ambiguous');
    assert.ok('response' in ambiguous);
    assert.equal(ambiguous.response.candidates[0]?.locationId, moscow.locationId, 'primary name must outrank alias');

    const updated = await ingestion.upsert(location({
      searchNames: ['Москва', 'Moskva'],
      population: 13_100_000,
    }));
    assert.equal(updated.locationId, moscow.locationId, 'same source identity in same revision keeps ARVELIS id');
    assert.equal(idCounter, 3, 'updating an existing source identity must not allocate another id');

    const oldAlias = await repository.searchExact({
      source: 'geonames',
      sourceRevision: REVISION.revision,
      normalizedLabel: normalizeLocationDirectoryName('Moscow'),
      countryCode: 'RU',
      maxMatches: 10,
    });
    assert.equal(oldAlias.length, 0, 're-upsert must replace stale aliases transactionally');

    const secondRevision: LocationDirectoryRevisionV1 = {
      ...REVISION,
      revision: 'geonames:RU:sqlite-smoke:v2',
      sourceModifiedDate: '2026-09-18',
      retrievedAt: '2026-09-18T12:00:00.000Z',
      sourceFingerprint: '2'.repeat(64),
    };
    await ingestion.registerRevision(secondRevision);
    const sameIdentityNextRevision = await ingestion.upsert(location({
      sourceRevision: secondRevision.revision,
      population: 13_200_000,
    }));
    assert.equal(sameIdentityNextRevision.locationId, moscow.locationId, 'stable source identity must survive revision refresh');
    assert.equal(idCounter, 3);

    const identityCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM travel_location_identities
      WHERE source = 'geonames'
    `).get() as { count?: unknown } | undefined;
    assert.equal(identityCount?.count, 2);

    const nextRevisionDirectory = new RepositoryTravelLocationDirectory(repository, {
      id: 'sqlite-geonames-ru-v2',
      source: 'geonames',
      revision: secondRevision.revision,
    });
    const resolved = await new LocationResolutionService(nextRevisionDirectory).resolve({
      version: 1,
      rawLabel: 'Москва',
      locale: 'ru-RU',
      countryCode: 'RU',
      limit: 5,
    }, context());
    assert.equal(resolved.status, 'resolved');
    assert.ok('response' in resolved);
    assert.equal(resolved.response.candidates[0]?.locationId, moscow.locationId);

    console.log('Location Directory SQLite Persistence V1: PASS');
  } finally {
    database.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
