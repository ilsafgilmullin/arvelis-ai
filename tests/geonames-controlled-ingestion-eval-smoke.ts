import assert from 'node:assert/strict';
import {
  GeoNamesIngestionEvaluationError,
  MAX_GEONAMES_EVAL_PROBES,
  evaluateGeoNamesTsvLines,
} from '../server/travel/locationSources/geonamesIngestionEvaluation';

function line(overrides: Partial<Record<number, string>> = {}): string {
  const fields = [
    '524901',
    'Москва',
    'Moscow',
    'Moskva,Moscow,DoNotLeakRawAlias',
    '55.75222',
    '37.61556',
    'P',
    'PPLC',
    'RU',
    '',
    '48',
    '',
    '',
    '',
    '13000000',
    '',
    '120',
    'Europe/Moscow',
    '2026-09-15',
  ];
  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) fields[Number(index)] = value;
  }
  return fields.join('\t');
}

async function* syntheticLines(): AsyncGenerator<string> {
  yield line();
  yield line({ 0: '900001', 6: 'P', 7: 'PPLX', 14: '1000', 18: '2026-09-14' });
  yield line({
    0: '551487',
    1: 'Казань',
    2: 'Kazan',
    3: 'Kazan,Qazan',
    4: '55.78874',
    5: '49.12214',
    7: 'PPLA',
    10: '73',
    14: '1310000',
    18: '2026-09-13',
  });
  yield line({
    0: '900002',
    1: 'Synthetic Station',
    2: 'Synthetic Station',
    3: '',
    4: '55.77',
    5: '37.66',
    6: 'S',
    7: 'RSTN',
    14: '0',
    18: '2026-09-12',
  });
  yield line({
    0: '900003',
    1: 'Synthetic Airport',
    2: 'Synthetic Airport',
    3: '',
    4: '55.97',
    5: '37.41',
    6: 'S',
    7: 'AIRP',
    14: '0',
    18: '2026-09-11',
  });
  yield line({ 0: '900004', 6: 'S', 7: 'HSP' });
  yield line({ 0: '900005', 4: '99' });
}

async function main(): Promise<void> {
  const report = await evaluateGeoNamesTsvLines(syntheticLines(), {
    countryCode: 'RU',
    probeNames: ['Москва', 'Казань', 'Synthetic Station', 'missing'],
  });

  assert.equal(report.version, 1);
  assert.equal(report.source, 'geonames');
  assert.equal(report.countryCode, 'RU');
  assert.equal(report.totalLines, 7);
  assert.equal(report.accepted, 5);
  assert.equal(report.ignored, 1);
  assert.equal(report.invalid, 1);
  assert.deepEqual(report.byType, { city: 3, station: 1, airport: 1 });
  assert.deepEqual(report.byFeatureCode, { AIRP: 1, PPLA: 1, PPLC: 1, PPLX: 1, RSTN: 1 });
  assert.equal(report.duplicatePrimaryNameGroups, 1);
  assert.equal(report.maxPrimaryNameMultiplicity, 2);
  assert.equal(report.earliestModificationDate, '2026-09-11');
  assert.equal(report.latestModificationDate, '2026-09-15');
  assert.deepEqual(report.invalidSamples, [{ lineNumber: 7, code: 'invalid_target_record' }]);

  const moscow = report.probes.find((probe) => probe.query === 'Москва');
  assert.ok(moscow);
  assert.equal(moscow.matchCount, 2);
  assert.equal(moscow.truncated, false);
  assert.equal(moscow.matches.length, 2);
  assert.ok(moscow.matches.every((match) => !('locationId' in match)));
  const kazan = report.probes.find((probe) => probe.query === 'Казань');
  assert.equal(kazan?.matchCount, 1);
  const station = report.probes.find((probe) => probe.query === 'Synthetic Station');
  assert.equal(station?.matchCount, 1);
  const missing = report.probes.find((probe) => probe.query === 'missing');
  assert.equal(missing?.matchCount, 0);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('DoNotLeakRawAlias'), false, 'raw alias lists must not leak into the aggregate report');

  await assert.rejects(
    evaluateGeoNamesTsvLines(syntheticLines(), { countryCode: 'ru' }),
    (error: unknown) => error instanceof GeoNamesIngestionEvaluationError && error.code === 'invalid_evaluation_request',
  );
  await assert.rejects(
    evaluateGeoNamesTsvLines(syntheticLines(), { countryCode: 'RU', probeNames: [' bad '] }),
    (error: unknown) => error instanceof GeoNamesIngestionEvaluationError && error.code === 'invalid_evaluation_request',
  );
  await assert.rejects(
    evaluateGeoNamesTsvLines(syntheticLines(), {
      countryCode: 'RU',
      probeNames: Array.from({ length: MAX_GEONAMES_EVAL_PROBES + 1 }, (_, index) => `probe-${index}`),
    }),
    (error: unknown) => error instanceof GeoNamesIngestionEvaluationError && error.code === 'invalid_evaluation_request',
  );

  console.log('GeoNames controlled ingestion evaluation: PASS (synthetic stream only)');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
