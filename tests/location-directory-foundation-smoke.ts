import assert from 'node:assert/strict';
import {
  InMemoryLocationDirectoryRepository,
  LocationDirectoryIngestionService,
  RepositoryTravelLocationDirectory,
  normalizeLocationDirectoryName,
  validateLocationDirectorySourceLocationV1,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySourceLocationV1,
} from '../server/travel/locationDirectoryFoundation';
import {
  geoNamesManifestToDirectoryRevision,
  geoNamesSeedToDirectoryLocation,
} from '../server/travel/locationSources/geonamesDirectoryAdapter';
import {
  GEONAMES_ATTRIBUTION_URL,
  GEONAMES_LICENSE,
  parseGeoNamesDumpLine,
  type GeoNamesDumpManifestV1,
  type GeoNamesLocationSeedV1,
} from '../server/travel/locationSources/geonamesSource';
import { LocationResolutionService } from '../server/travel/locationResolutionService';
import { validateLocationResolutionQueryV1, type LocationResolutionQueryV1 } from '../src/travel/locationResolution';

const MANIFEST: GeoNamesDumpManifestV1 = {
  version: 1,
  source: 'geonames',
  countryCode: 'RU',
  archiveUrl: 'https://download.geonames.org/export/dump/RU.zip',
  archiveSha256: 'a'.repeat(64),
  archiveBytes: 15_000_000,
  sourceModifiedDate: '2026-09-16',
  retrievedAt: '2026-09-16T12:00:00.000Z',
  license: GEONAMES_LICENSE,
  attributionUrl: GEONAMES_ATTRIBUTION_URL,
};

function seed(overrides: Partial<GeoNamesLocationSeedV1> = {}): GeoNamesLocationSeedV1 {
  return {
    version: 1,
    source: 'geonames',
    geonameId: 524901,
    displayName: 'Москва',
    searchNames: ['Москва', 'Moscow'],
    aliasesTruncated: false,
    type: 'city',
    featureClass: 'P',
    featureCode: 'PPLC',
    countryCode: 'RU',
    latitude: 55.75222,
    longitude: 37.61556,
    timezone: 'Europe/Moscow',
    population: 13_000_000,
    modificationDate: '2026-09-15',
    admin1Code: '48',
    ...overrides,
  };
}

function context() {
  return {
    accountScopeId: 'account-location-directory-smoke',
    requestId: 'request-location-directory-smoke',
    signal: new AbortController().signal,
  };
}

function query(rawLabel: string, overrides: Partial<LocationResolutionQueryV1> = {}): LocationResolutionQueryV1 {
  return {
    version: 1,
    rawLabel,
    locale: 'ru-RU',
    countryCode: 'RU',
    limit: 5,
    ...overrides,
  };
}

async function main(): Promise<void> {
  assert.equal(normalizeLocationDirectoryName('  МОСКВА   '), 'москва');
  assert.equal(validateLocationResolutionQueryV1({ ...query('Москва'), limit: 1 }).ok, false, 'limit=1 must not hide ambiguity');
  assert.equal(validateLocationResolutionQueryV1({ ...query('Москва'), limit: 2 }).ok, true);

  const revision = geoNamesManifestToDirectoryRevision(MANIFEST);
  assert.equal(revision.source, 'geonames');
  assert.equal(revision.countryCode, 'RU');
  assert.ok(revision.revision.startsWith('geonames:RU:2026-09-16:'));
  assert.equal(revision.sourceFingerprint, MANIFEST.archiveSha256);

  const repository = new InMemoryLocationDirectoryRepository();
  let nextId = 1;
  const ingestion = new LocationDirectoryIngestionService(repository, {
    locationIdFactory: () => `arvelis:location:test-${nextId++}`,
  });
  await ingestion.registerRevision(revision);

  const moscowPrimary = await ingestion.upsert(geoNamesSeedToDirectoryLocation(seed(), revision.revision));
  assert.equal(moscowPrimary.locationId, 'arvelis:location:test-1');
  assert.equal('geonameId' in moscowPrimary, false);

  const moscowAliasSeed = seed({
    geonameId: 900001,
    displayName: 'Москва-Сити',
    searchNames: ['Москва-Сити', 'Москва', 'Moscow'],
    population: 20_000_000,
    featureCode: 'PPLX',
  });
  const moscowAlias = await ingestion.upsert(geoNamesSeedToDirectoryLocation(moscowAliasSeed, revision.revision));
  assert.equal(moscowAlias.locationId, 'arvelis:location:test-2');

  const kazan = await ingestion.upsert(geoNamesSeedToDirectoryLocation(seed({
    geonameId: 551487,
    displayName: 'Казань',
    searchNames: ['Казань', 'Kazan', 'Qazan'],
    latitude: 55.78874,
    longitude: 49.12214,
    population: 1_310_000,
    featureCode: 'PPLA',
    admin1Code: '73',
  }), revision.revision));
  assert.equal(kazan.locationId, 'arvelis:location:test-3');

  const regionPreferred: LocationDirectorySourceLocationV1 = {
    version: 1,
    source: 'geonames',
    sourceRevision: revision.revision,
    externalSourceId: '910001',
    displayName: 'Берёзовка',
    searchNames: ['Берёзовка'],
    type: 'city',
    countryCode: 'RU',
    region: 'Республика Татарстан',
    timezone: 'Europe/Moscow',
    latitude: 55.7,
    longitude: 49.1,
    population: 100,
  };
  const regionOther: LocationDirectorySourceLocationV1 = {
    ...regionPreferred,
    externalSourceId: '910002',
    region: 'Самарская область',
    latitude: 53.2,
    longitude: 50.1,
    population: 1_000_000,
  };
  assert.equal(validateLocationDirectorySourceLocationV1(regionPreferred), true);
  await ingestion.upsert(regionOther);
  await ingestion.upsert(regionPreferred);

  const directory = new RepositoryTravelLocationDirectory(repository, {
    id: 'geonames-ru-internal',
    source: 'geonames',
    revision: revision.revision,
  });
  const resolver = new LocationResolutionService(directory);

  const moscow = await resolver.resolve(query('Москва'), context());
  assert.equal(moscow.status, 'ambiguous');
  assert.ok('response' in moscow);
  assert.equal(moscow.response.candidates.length, 2);
  assert.equal(moscow.response.candidates[0]?.locationId, moscowPrimary.locationId, 'primary-name match ranks above alias even when alias population is larger');
  assert.ok(moscow.response.candidates.every((candidate) => !('externalSourceId' in candidate)));
  assert.ok(moscow.response.candidates.every((candidate) => !('source' in candidate)));

  const kazanResolved = await resolver.resolve(query('Казань'), context());
  assert.equal(kazanResolved.status, 'resolved');
  assert.ok('response' in kazanResolved);
  assert.deepEqual(kazanResolved.response.candidates.map((candidate) => candidate.locationId), [kazan.locationId]);

  const missing = await resolver.resolve(query('Неизвестный город'), context());
  assert.equal(missing.status, 'unresolved');

  const wrongCountry = await resolver.resolve(query('Москва', { countryCode: 'KZ' }), context());
  assert.equal(wrongCountry.status, 'unresolved');

  const regionRanked = await resolver.resolve(query('Берёзовка', { region: 'Республика Татарстан', limit: 2 }), context());
  assert.equal(regionRanked.status, 'ambiguous');
  assert.ok('response' in regionRanked);
  assert.equal(regionRanked.response.candidates[0]?.region, 'Республика Татарстан', 'explicit region context ranks first but does not auto-resolve');

  const cityOnly = await resolver.resolve(query('Москва', { types: ['city'], limit: 2 }), context());
  assert.equal(cityOnly.status, 'ambiguous');

  const secondManifest: GeoNamesDumpManifestV1 = {
    ...MANIFEST,
    archiveSha256: 'b'.repeat(64),
    sourceModifiedDate: '2026-09-17',
    retrievedAt: '2026-09-17T12:00:00.000Z',
  };
  const secondRevision = geoNamesManifestToDirectoryRevision(secondManifest);
  await ingestion.registerRevision(secondRevision);
  const sameSourceNewRevision = await ingestion.upsert(geoNamesSeedToDirectoryLocation(seed({
    population: 13_100_000,
    modificationDate: '2026-09-16',
  }), secondRevision.revision));
  assert.equal(sameSourceNewRevision.locationId, moscowPrimary.locationId, 'ARVELIS identity must remain stable across source revisions');
  assert.equal(nextId, 6, 'stable source identity must not consume a new ARVELIS id');

  const conflictingRevision: LocationDirectoryRevisionV1 = { ...revision, sourceFingerprint: 'c'.repeat(64) };
  await assert.rejects(repository.putRevision(conflictingRevision), /revision conflict/);

  await assert.rejects(
    ingestion.upsert({ ...geoNamesSeedToDirectoryLocation(seed({ geonameId: 999991 }), revision.revision), sourceRevision: 'geonames:RU:missing' }),
    /revision is not registered/,
  );

  assert.equal(validateLocationDirectorySourceLocationV1({
    ...geoNamesSeedToDirectoryLocation(seed({ geonameId: 999992 }), revision.revision),
    searchNames: ['Москва', 'МОСКВА'],
  }), false, 'normalized duplicate aliases are rejected');

  const parsed = parseGeoNamesDumpLine([
    '900100', 'Синтетический вокзал', 'Synthetic Station', 'Station Alias', '55.7', '37.6',
    'S', 'RSTN', 'RU', '', '48', '', '', '', '0', '', '120', 'Europe/Moscow', '2026-09-16',
  ].join('\t'), 'RU');
  assert.equal(parsed.status, 'accepted');
  if (parsed.status === 'accepted') {
    const adapted = geoNamesSeedToDirectoryLocation(parsed.seed, revision.revision);
    assert.equal(adapted.type, 'station');
    assert.equal(adapted.externalSourceId, '900100');
    assert.equal('geonameId' in adapted, false);
  }

  console.log('Location Directory Persistence & Ranking Foundation V1: PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
