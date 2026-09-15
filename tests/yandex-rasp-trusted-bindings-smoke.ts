import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseYandexRaspTrustedBindingsManifest } from '../server/travel/providers/yandexRaspTrustedBindings';

const VERIFIED_AT = '2026-09-15T20:00:00.000Z';
const city = {
  locationId: 'arvelis:test-city',
  locationType: 'city' as const,
  searchCode: 'c100',
  stationCodes: ['s101', 's102'],
  verifiedAt: VERIFIED_AT,
};
const station = {
  locationId: 'arvelis:test-station',
  locationType: 'station' as const,
  searchCode: 's200',
  stationCodes: ['s200'],
  verifiedAt: VERIFIED_AT,
};

function manifest(entries: unknown[]) {
  return { version: 1, environment: 'development', entries };
}

function main() {
  let checks = 0;
  const configured = parseYandexRaspTrustedBindingsManifest(manifest([city, station]), 'development');
  assert.deepEqual(configured.get(city.locationId), { searchCode: 'c100', stationCodes: ['s101', 's102'] });
  assert.deepEqual(configured.get(station.locationId), { searchCode: 's200', stationCodes: ['s200'] });
  checks++;

  const checkedIn = JSON.parse(readFileSync('config/yandex-rasp-development-bindings.v1.json', 'utf8')) as unknown;
  assert.equal(parseYandexRaspTrustedBindingsManifest(checkedIn, 'development').size, 0);
  checks++;

  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city }, { ...city }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, locationId: 'arvelis:other', searchCode: city.searchCode }]), 'production'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, searchCode: 's100' }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...station, stationCodes: ['s201'] }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, locationId: 'provider:c100' }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, verifiedAt: '2026-09-15' }]), 'development'));
  checks++;

  const poisoned = JSON.parse('{"version":1,"environment":"development","entries":[],"__proto__":{"polluted":true}}') as unknown;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(poisoned, 'development'));
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  checks++;

  console.log(`Yandex trusted bindings smoke passed (${checks} checks).`);
}

main();
