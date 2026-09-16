import assert from 'node:assert/strict';
import {
  GEONAMES_ATTRIBUTION_URL,
  GEONAMES_LICENSE,
  MAX_GEONAMES_SEARCH_NAMES,
  expectedGeoNamesArchiveUrl,
  parseGeoNamesDumpLine,
  validateGeoNamesDumpManifestV1,
} from '../server/travel/locationSources/geonamesSource';

const NOW = new Date('2026-09-16T18:00:00.000Z');

function line(overrides: Partial<Record<number, string>> = {}): string {
  const fields = [
    '551487',
    'Synthetic Kazan',
    'Synthetic Kazan',
    'Казань,Kazan,Synthetic Kazan',
    '55.796127',
    '49.106414',
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
    '2026-09-15',
  ];
  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) fields[Number(index)] = value;
  }
  return fields.join('\t');
}

function manifest() {
  return {
    version: 1,
    source: 'geonames',
    countryCode: 'RU',
    archiveUrl: 'https://download.geonames.org/export/dump/RU.zip',
    archiveSha256: 'a'.repeat(64),
    archiveBytes: 15_000_000,
    sourceModifiedDate: '2026-09-16',
    retrievedAt: '2026-09-16T17:00:00.000Z',
    license: GEONAMES_LICENSE,
    attributionUrl: GEONAMES_ATTRIBUTION_URL,
  };
}

function accepted(value: ReturnType<typeof parseGeoNamesDumpLine>) {
  assert.equal(value.status, 'accepted');
  if (value.status !== 'accepted') throw new Error('Expected accepted GeoNames seed');
  return value.seed;
}

function main() {
  assert.equal(expectedGeoNamesArchiveUrl('RU'), 'https://download.geonames.org/export/dump/RU.zip');
  assert.equal(expectedGeoNamesArchiveUrl('ru'), null);
  assert.equal(expectedGeoNamesArchiveUrl('RUS'), null);

  const validManifest = validateGeoNamesDumpManifestV1(manifest(), NOW);
  assert.equal(validManifest.ok, true);
  if (validManifest.ok) {
    assert.equal(validManifest.manifest.countryCode, 'RU');
    assert.equal(validManifest.manifest.license, 'CC-BY-4.0');
  }

  for (const [label, change] of [
    ['wrong host', (value: ReturnType<typeof manifest>) => { value.archiveUrl = 'https://example.test/RU.zip'; }],
    ['query injection', (value: ReturnType<typeof manifest>) => { value.archiveUrl += '?mirror=1'; }],
    ['uppercase hash', (value: ReturnType<typeof manifest>) => { value.archiveSha256 = 'A'.repeat(64); }],
    ['zero bytes', (value: ReturnType<typeof manifest>) => { value.archiveBytes = 0; }],
    ['wrong license', (value: ReturnType<typeof manifest>) => { value.license = 'custom' as never; }],
    ['wrong attribution', (value: ReturnType<typeof manifest>) => { value.attributionUrl = 'https://example.test/' as never; }],
    ['future retrievedAt', (value: ReturnType<typeof manifest>) => { value.retrievedAt = '2026-09-16T18:02:00.000Z'; }],
    ['source newer than retrieval', (value: ReturnType<typeof manifest>) => { value.sourceModifiedDate = '2026-09-17'; }],
  ] as const) {
    const candidate = manifest();
    change(candidate);
    assert.deepEqual(validateGeoNamesDumpManifestV1(candidate, NOW), { ok: false, code: 'invalid_manifest' }, label);
  }
  assert.deepEqual(validateGeoNamesDumpManifestV1({ ...manifest(), extra: true }, NOW), { ok: false, code: 'invalid_manifest' });
  assert.deepEqual(validateGeoNamesDumpManifestV1(Object.assign(Object.create({ polluted: true }), manifest()), NOW), { ok: false, code: 'invalid_manifest' });

  const city = accepted(parseGeoNamesDumpLine(line(), 'RU'));
  assert.equal(city.type, 'city');
  assert.equal(city.featureClass, 'P');
  assert.equal(city.featureCode, 'PPLA');
  assert.equal(city.countryCode, 'RU');
  assert.equal(city.geonameId, 551487);
  assert.equal(city.timezone, 'Europe/Moscow');
  assert.equal(city.population, 1_310_000);
  assert.ok(city.searchNames.includes('Казань'));
  assert.ok(city.searchNames.includes('Kazan'));
  assert.equal(city.aliasesTruncated, false);
  assert.equal('locationId' in city, false, 'source seed must never mint an ARVELIS locationId');
  assert.equal('providerCode' in city, false);

  const station = accepted(parseGeoNamesDumpLine(line({ 6: 'S', 7: 'RSTN', 1: 'Synthetic Station', 2: 'Synthetic Station' }), 'RU'));
  assert.equal(station.type, 'station');
  const railStop = accepted(parseGeoNamesDumpLine(line({ 6: 'S', 7: 'RSTP', 1: 'Synthetic Rail Stop' }), 'RU'));
  assert.equal(railStop.type, 'station');
  const busStation = accepted(parseGeoNamesDumpLine(line({ 6: 'S', 7: 'BUSTN', 1: 'Synthetic Bus Station' }), 'RU'));
  assert.equal(busStation.type, 'station');
  const airport = accepted(parseGeoNamesDumpLine(line({ 6: 'S', 7: 'AIRP', 1: 'Synthetic Airport' }), 'RU'));
  assert.equal(airport.type, 'airport');

  assert.deepEqual(parseGeoNamesDumpLine(line({ 6: 'S', 7: 'HSP' }), 'RU'), { status: 'ignored', reason: 'unsupported_feature' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 6: 'P', 7: 'PPLQ' }), 'RU'), { status: 'ignored', reason: 'unsupported_feature' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 8: 'DE' }), 'RU'), { status: 'invalid', code: 'country_mismatch' });
  assert.deepEqual(parseGeoNamesDumpLine(line().split('\t').slice(0, 18).join('\t'), 'RU'), { status: 'invalid', code: 'invalid_line' });
  assert.deepEqual(parseGeoNamesDumpLine(`${line()}\n`, 'RU'), { status: 'invalid', code: 'invalid_line' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 0: '0' }), 'RU'), { status: 'invalid', code: 'invalid_line' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 4: '91' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 5: '-181' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 14: '-1' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 17: 'UTC+3' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 18: '2026-02-30' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });
  assert.deepEqual(parseGeoNamesDumpLine(line({ 10: 'bad code with spaces' }), 'RU'), { status: 'invalid', code: 'invalid_target_record' });

  const manyAliases = Array.from({ length: MAX_GEONAMES_SEARCH_NAMES + 20 }, (_, index) => `Alias-${index}`).join(',');
  const boundedAliases = accepted(parseGeoNamesDumpLine(line({ 3: manyAliases }), 'RU'));
  assert.equal(boundedAliases.searchNames.length, MAX_GEONAMES_SEARCH_NAMES);
  assert.equal(boundedAliases.aliasesTruncated, true);

  const deduped = accepted(parseGeoNamesDumpLine(line({ 1: 'Казань', 2: 'Kazan', 3: 'казань,KAZAN,Казань' }), 'RU'));
  assert.deepEqual(deduped.searchNames, ['Казань', 'Kazan']);

  console.log('GeoNames location source contract: PASS (synthetic TSV only; no real dump/network)');
}

main();
