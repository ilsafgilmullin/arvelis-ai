import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { PostgresLocationDirectoryRepository } from '../server/persistence/postgres/locationDirectoryRepository';
import {
  LocationDirectoryIngestionService,
  RepositoryTravelLocationDirectory,
  normalizeLocationDirectoryName,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySourceLocationV1,
} from '../server/travel/locationDirectoryFoundation';
import { LocationResolutionService } from '../server/travel/locationResolutionService';

function context() {
  return {
    accountScopeId: 'postgres-location-smoke',
    requestId: 'postgres-location-request',
    signal: new AbortController().signal,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL Location Directory smoke');

  const pool = new Pool({ connectionString, max: 2, application_name: 'arvelis-location-directory-postgres-smoke' });
  const suffix = `${process.pid}-${Date.now()}`;
  const revision: LocationDirectoryRevisionV1 = {
    version: 1,
    source: 'geonames',
    revision: `geonames:RU:pg-smoke:${suffix}`,
    countryCode: 'RU',
    sourceModifiedDate: '2026-09-17',
    retrievedAt: '2026-09-17T12:00:00.000Z',
    sourceFingerprint: '3'.repeat(64),
    license: 'CC-BY-4.0',
    attributionUrl: 'https://www.geonames.org/',
  };

  const location = (overrides: Partial<LocationDirectorySourceLocationV1> = {}): LocationDirectorySourceLocationV1 => ({
    version: 1,
    source: 'geonames',
    sourceRevision: revision.revision,
    externalSourceId: `524901-${suffix}`,
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
  });

  try {
    const schema = await pool.query<{ revisions: string | null; identities: string | null; records: string | null; names: string | null }>(`
      SELECT
        to_regclass('public.travel_location_directory_revisions')::text AS revisions,
        to_regclass('public.travel_location_identities')::text AS identities,
        to_regclass('public.travel_location_records')::text AS records,
        to_regclass('public.travel_location_names')::text AS names
    `);
    assert.deepEqual(schema.rows[0], {
      revisions: 'travel_location_directory_revisions',
      identities: 'travel_location_identities',
      records: 'travel_location_records',
      names: 'travel_location_names',
    });

    const repository = new PostgresLocationDirectoryRepository(pool);
    let idCounter = 1;
    const ingestion = new LocationDirectoryIngestionService(repository, {
      locationIdFactory: () => `arvelis:location:pg-${suffix}-${idCounter++}`,
    });
    await ingestion.registerRevision(revision);

    const moscow = await ingestion.upsert(location());
    assert.ok(moscow.locationId.startsWith(`arvelis:location:pg-${suffix}-`));

    const alias = await ingestion.upsert(location({
      externalSourceId: `900001-${suffix}`,
      displayName: 'Москва-Сити',
      searchNames: ['Москва-Сити', 'Москва', 'Moscow City'],
      population: 20_000_000,
    }));
    assert.notEqual(alias.locationId, moscow.locationId);

    const resolver = new LocationResolutionService(new RepositoryTravelLocationDirectory(repository, {
      id: 'postgres-geonames-ru',
      source: 'geonames',
      revision: revision.revision,
    }));
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
    assert.equal(updated.locationId, moscow.locationId);
    assert.equal(idCounter, 3, 'same source identity must not allocate a new ARVELIS id');

    const oldAlias = await repository.searchExact({
      source: 'geonames',
      sourceRevision: revision.revision,
      normalizedLabel: normalizeLocationDirectoryName('Moscow'),
      countryCode: 'RU',
      maxMatches: 10,
    });
    assert.equal(oldAlias.length, 0, 're-upsert must replace stale aliases transactionally');

    const secondRevision: LocationDirectoryRevisionV1 = {
      ...revision,
      revision: `geonames:RU:pg-smoke-next:${suffix}`,
      sourceModifiedDate: '2026-09-18',
      retrievedAt: '2026-09-18T12:00:00.000Z',
      sourceFingerprint: '4'.repeat(64),
    };
    await ingestion.registerRevision(secondRevision);
    const sameIdentityNextRevision = await ingestion.upsert(location({
      sourceRevision: secondRevision.revision,
      population: 13_200_000,
    }));
    assert.equal(sameIdentityNextRevision.locationId, moscow.locationId);
    assert.equal(idCounter, 3);

    const identityCount = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM travel_location_identities
      WHERE source = 'geonames'
        AND external_source_id IN ($1, $2)
    `, [`524901-${suffix}`, `900001-${suffix}`]);
    assert.equal(identityCount.rows[0]?.count, '2');

    const nextRevisionResolver = new LocationResolutionService(new RepositoryTravelLocationDirectory(repository, {
      id: 'postgres-geonames-ru-v2',
      source: 'geonames',
      revision: secondRevision.revision,
    }));
    const resolved = await nextRevisionResolver.resolve({
      version: 1,
      rawLabel: 'Москва',
      locale: 'ru-RU',
      countryCode: 'RU',
      limit: 5,
    }, context());
    assert.equal(resolved.status, 'resolved');
    assert.ok('response' in resolved);
    assert.equal(resolved.response.candidates[0]?.locationId, moscow.locationId);

    console.log('Location Directory PostgreSQL Persistence V1: PASS');
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
