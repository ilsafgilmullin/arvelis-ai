import './trusted-location-provider-binding-smoke';
import './routes-location-boundary-smoke';
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
  checks++;

  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([city, city]), 'development'), /duplicate/i);
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...station, searchCode: 'c999' }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, stationCodes: [] }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest(manifest([{ ...city, verifiedAt: 'not-a-date' }]), 'development'));
  checks++;
  assert.throws(() => parseYandexRaspTrustedBindingsManifest({ version: 1, environment: 'production', entries: [city] }, 'development'));
  checks++;

  assert.deepEqual(bindTrustedLocationToYandexRasp([], configured), { status: 'unresolved', code: 'location_unresolved' });
  checks++;
  assert.deepEqual(bindTrustedLocationToYandexRasp([candidate(city.locationId, 'A'), candidate(station.locationId, 'B')], configured), { status: 'ambiguous', code: 'location_ambiguous' });
  checks++;
  assert.deepEqual(bindTrustedLocationToYandexRasp([candidate('arvelis:missing', 'Missing')], configured), { status: 'unresolved', code: 'provider_binding_missing' });
  checks++;

  console.log(`Yandex Rasp trusted bindings smoke passed (${checks} checks).`);
}

main();
