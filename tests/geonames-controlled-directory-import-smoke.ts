import assert from 'node:assert/strict';
import {
  GEONAMES_ATTRIBUTION_URL,
  GEONAMES_LICENSE,
  type GeoNamesDumpManifestV1,
} from '../server/travel/locationSources/geonamesSource';
import {
  GeoNamesControlledDirectoryImportError,
  GeoNamesControlledDirectoryImporter,
} from '../server/travel/locationSources/geonamesControlledDirectoryImport';
import {
  geoNamesManifestToDirectoryRevision,
} from '../server/travel/locationSources/geonamesDirectoryAdapter';
import {
  InMemoryLocationDirectoryRepository,
  RepositoryTravelLocationDirectory,
} from '../server/travel/locationDirectoryFoundation';
import { LocationResolutionService } from '../server/travel/locationResolutionService';

function line(overrides: Partial<Record<number, string>> = {}): string {
  const fields = [
    '551487',
    'Казань',
    'Kazan',
    'Казань,Kazan,Qazan',
    '55.78874',
    '49.12214',
    'P',
    'PPLA',
    'RU',
    '',
    '73',
    '',
    '',
    '',
    '1310000',
    '',
    '53',
    'Europe/Moscow',
    '2026-09-17',
  ];
  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) fields[Number(index)] = value;
  }
  return fields.join('\t');
}

const BASE_LINES = [
  line(),
  line({
    0: '524901',
    1: 'Москва',
    2: 'Moscow',
    3: 'Москва,Moscow,Moskva',
    4: '55.75222',
    5: '37.61556',
    7: 'PPLC',
    10: '48',
    14: '13000000',
  }),
  line({
    0: '900002',
    1: 'Казань-Пасс.',
    2: 'Kazan-Pass',
    3: 'Казань-Пасс.,Kazan-Pass',
    4: '55.7876',
    5: '49.1006',
    6: 'S',
    7: 'RSTN',
    14: '0',
  }),
  line({ 0: '900003', 6: 'S', 7: 'HSP' }),
];

const MANIFEST: GeoNamesDumpManifestV1 = {
  version: 1,
  source: 'geonames',
  countryCode: 'RU',
  archiveUrl: 'https://download.geonames.org/export/dump/RU.zip',
  archiveSha256: 'b'.repeat(64),
  archiveBytes: 15_200_000,
  sourceModifiedDate: '2026-09-17',
  retrievedAt: '2026-09-17T18:00:00.000Z',
  license: GEONAMES_LICENSE,
  attributionUrl: GEONAMES_ATTRIBUTION_URL,
};

function sourceFactory(lines: readonly string[]) {
  return () => (async function* (): AsyncGenerator<string> {
    for (const value of lines) yield value;
  })();
}

async function main(): Promise<void> {
  const repository = new InMemoryLocationDirectoryRepository();
  let identity = 0;
  const importer = new GeoNamesControlledDirectoryImporter(repository);
  const report = await importer.import(MANIFEST, sourceFactory(BASE_LINES), {
    maxAcceptedRecords: 10,
    maxInvalidRecords: 0,
    writeConcurrency: 2,
    locationIdFactory: () => `arvelis:location:import-${++identity}`,
  });

  assert.equal(report.version, 1);
  assert.equal(report.source, 'geonames');
  assert.equal(report.countryCode, 'RU');
  assert.equal(report.accepted, 3);
  assert.equal(report.persisted, 3);
  assert.equal(report.ignored, 1);
  assert.equal(report.invalid, 0);
  assert.deepEqual(report.byType, { city: 2, station: 1, airport: 0 });
  assert.match(report.sourceDigestSha256, /^[a-f0-9]{64}$/);

  const revision = geoNamesManifestToDirectoryRevision(MANIFEST);
  assert.equal(report.sourceRevision, revision.revision);
  assert.ok(await repository.getRevision('geonames', revision.revision));

  const directory = new RepositoryTravelLocationDirectory(repository, {
    id: 'controlled-geonames-directory',
    source: 'geonames',
    revision: revision.revision,
  });
  const resolved = await new LocationResolutionService(directory).resolve({
    version: 1,
    rawLabel: 'Казань',
    locale: 'ru-RU',
    countryCode: 'RU',
    types: ['city'],
    limit: 5,
  }, {
    accountScopeId: 'account-import-smoke',
    requestId: 'request-import-smoke',
    signal: new AbortController().signal,
  });
  assert.equal(resolved.status, 'resolved');
  assert.ok('response' in resolved);
  const firstLocationId = resolved.response.candidates[0]?.locationId;
  assert.equal(firstLocationId, 'arvelis:location:import-1');

  // Re-importing the same immutable revision is idempotent and keeps internal identities stable.
  let retryIdentity = 100;
  const retried = await importer.import(MANIFEST, sourceFactory(BASE_LINES), {
    maxAcceptedRecords: 10,
    maxInvalidRecords: 0,
    writeConcurrency: 3,
    locationIdFactory: () => `arvelis:location:retry-${++retryIdentity}`,
  });
  assert.equal(retried.persisted, 3);
  const resolvedAfterRetry = await new LocationResolutionService(directory).resolve({
    version: 1,
    rawLabel: 'Казань',
    locale: 'ru-RU',
    countryCode: 'RU',
    types: ['city'],
    limit: 5,
  }, {
    accountScopeId: 'account-import-smoke',
    requestId: 'request-import-retry',
    signal: new AbortController().signal,
  });
  assert.ok('response' in resolvedAfterRetry);
  assert.equal(resolvedAfterRetry.response.candidates[0]?.locationId, firstLocationId);

  // Explicit invalid-row budget rejects the source before a revision is registered.
  const invalidRepository = new InMemoryLocationDirectoryRepository();
  const invalidImporter = new GeoNamesControlledDirectoryImporter(invalidRepository);
  const invalidManifest = { ...MANIFEST, archiveSha256: 'c'.repeat(64) };
  const invalidLines = [...BASE_LINES, line({ 0: '900004', 4: '99' })];
  await assert.rejects(
    () => invalidImporter.import(invalidManifest, sourceFactory(invalidLines), {
      maxAcceptedRecords: 10,
      maxInvalidRecords: 0,
    }),
    (error: unknown) => error instanceof GeoNamesControlledDirectoryImportError
      && error.code === 'preflight_rejected',
  );
  const invalidRevision = geoNamesManifestToDirectoryRevision(invalidManifest);
  assert.equal(await invalidRepository.getRevision('geonames', invalidRevision.revision), null);

  // A changing source is detected by the verification pass before persistence begins.
  const changingRepository = new InMemoryLocationDirectoryRepository();
  const changingImporter = new GeoNamesControlledDirectoryImporter(changingRepository);
  const changingManifest = { ...MANIFEST, archiveSha256: 'd'.repeat(64) };
  let sourceOpenCount = 0;
  const changingFactory = () => {
    sourceOpenCount += 1;
    const lines = sourceOpenCount === 1
      ? BASE_LINES
      : [BASE_LINES[0]!, BASE_LINES[1]!.replace('Москва', 'Москва-изменена'), BASE_LINES[2]!, BASE_LINES[3]!];
    return sourceFactory(lines)();
  };
  await assert.rejects(
    () => changingImporter.import(changingManifest, changingFactory, {
      maxAcceptedRecords: 10,
      maxInvalidRecords: 0,
    }),
    (error: unknown) => error instanceof GeoNamesControlledDirectoryImportError
      && error.code === 'source_changed',
  );
  const changingRevision = geoNamesManifestToDirectoryRevision(changingManifest);
  assert.equal(await changingRepository.getRevision('geonames', changingRevision.revision), null);
  assert.equal(sourceOpenCount, 2);

  // Accepted-record ceilings are operator-controlled and fail closed.
  const boundedRepository = new InMemoryLocationDirectoryRepository();
  await assert.rejects(
    () => new GeoNamesControlledDirectoryImporter(boundedRepository).import(
      { ...MANIFEST, archiveSha256: 'e'.repeat(64) },
      sourceFactory(BASE_LINES),
      { maxAcceptedRecords: 2, maxInvalidRecords: 0 },
    ),
    (error: unknown) => error instanceof GeoNamesControlledDirectoryImportError
      && error.code === 'preflight_rejected',
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => new GeoNamesControlledDirectoryImporter(new InMemoryLocationDirectoryRepository()).import(
      { ...MANIFEST, archiveSha256: 'f'.repeat(64) },
      sourceFactory(BASE_LINES),
      { maxAcceptedRecords: 10, maxInvalidRecords: 0, signal: controller.signal },
    ),
    (error: unknown) => error instanceof GeoNamesControlledDirectoryImportError
      && error.code === 'aborted',
  );

  console.log('GeoNames Controlled Directory Import V1: PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
