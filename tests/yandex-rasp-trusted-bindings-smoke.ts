import './trusted-location-provider-binding-smoke';
import './routes-location-boundary-smoke';
import './routes-resolution-service-smoke';
import './routes-resolution-http-boundary-smoke';
import './routes-resolution-runtime-smoke';
import './routes-resolution-authenticated-runtime-smoke';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import { bindTrustedLocationToYandexRasp } from '../server/travel/providers/trustedLocationProviderBinding';
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

function candidate(locationId: string, displayName: string): TravelLocationCandidateV1 {
  return { locationId, displayName, type: 'station', countryCode: 'RU', timezone: 'Europe/Moscow' };
}

function main() {
  let checks = 0;
  const configured = parseYandexRaspTrustedBindingsManifest(manifest([city, station]), 'development');
  assert.deepEqual(configured.get(city.locationId), { searchCode: 'c100', stationCodes: ['s101', 's102'] });
  assert.deepEqual(configured.get(station.locationId), { searchCode: 's200', stationCodes: ['s200'] });
  checks++;

  const checkedIn = JSON.parse(readFileSync('config/yandex-rasp-development-bindings.v1.json', 'utf8')) as unknown;
  const developmentBindings = parseYandexRaspTrustedBindingsManifest(checkedIn, 'development');
  assert.equal(developmentBindings.size, 2);
  assert.deepEqual(developmentBindings.get('arvelis:dev:station:moscow-kazansky'), { searchCode: 's2000003', stationCodes: ['s2000003'] });
  assert.deepEqual(developmentBindings.get('arvelis:dev:station:kazan-pass'), { searchCode: 's9623141', stationCodes: ['s9623141'] });
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(checkedIn, 'production'));
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

  assert.deepEqual(bindTrustedLocationToYandexRasp([], developmentBindings), { status: 'unresolved', code: 'location_unresolved' });
  checks++;
  assert.deepEqual(
    bindTrustedLocationToYandexRasp([
      candidate('arvelis:dev:station:moscow-kazansky', 'Москва (Казанский вокзал)'),
      candidate('arvelis:dev:station:kazan-pass', 'Казань-Пасс.'),
    ], developmentBindings),
    { status: 'ambiguous', code: 'location_ambiguous' },
  );
  checks++;
  assert.deepEqual(
    bindTrustedLocationToYandexRasp([candidate('arvelis:dev:station:unknown', 'Неизвестная')], developmentBindings),
    { status: 'unresolved', code: 'provider_binding_missing' },
  );
  checks++;
  const bound = bindTrustedLocationToYandexRasp(
    [candidate('arvelis:dev:station:moscow-kazansky', 'Москва (Казанский вокзал)')],
    developmentBindings,
  );
  assert.deepEqual(bound, {
    status: 'bound',
    binding: {
      locationId: 'arvelis:dev:station:moscow-kazansky',
      searchCode: 's2000003',
      stationCodes: ['s2000003'],
    },
  });
  if (bound.status !== 'bound') throw new Error('Expected bound outcome');
  assert.notStrictEqual(bound.binding.stationCodes, developmentBindings.get(bound.binding.locationId)?.stationCodes);
  assert.equal(Object.isFrozen(bound.binding.stationCodes), true);
  checks++;

  console.log(`Yandex trusted bindings smoke passed (${checks} checks).`);
}

main();