import assert from 'node:assert/strict';
import type { TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import { bindTrustedLocationToYandexRasp } from '../server/travel/providers/trustedLocationProviderBinding';
import type { YandexLocationBindings } from '../server/travel/providers/yandexRaspSearchMapping';

const MOSCOW_ID = 'arvelis:dev:station:moscow-kazansky';
const KAZAN_ID = 'arvelis:dev:station:kazan-pass';

function candidate(locationId: string, displayName: string): TravelLocationCandidateV1 {
  return {
    locationId,
    displayName,
    type: 'station',
    countryCode: 'RU',
    timezone: 'Europe/Moscow',
  };
}

function main() {
  let checks = 0;
  const bindings: YandexLocationBindings = new Map([
    [MOSCOW_ID, { searchCode: 's2000003', stationCodes: ['s2000003'] }],
    [KAZAN_ID, { searchCode: 's9623141', stationCodes: ['s9623141'] }],
  ]);

  assert.deepEqual(bindTrustedLocationToYandexRasp([], bindings), {
    status: 'unresolved',
    code: 'location_unresolved',
  });
  checks++;

  assert.deepEqual(
    bindTrustedLocationToYandexRasp(
      [candidate(MOSCOW_ID, 'Москва (Казанский вокзал)'), candidate(KAZAN_ID, 'Казань-Пасс.')],
      bindings,
    ),
    { status: 'ambiguous', code: 'location_ambiguous' },
  );
  checks++;

  assert.deepEqual(bindTrustedLocationToYandexRasp([candidate('arvelis:dev:station:unknown', 'Неизвестная')], bindings), {
    status: 'unresolved',
    code: 'provider_binding_missing',
  });
  checks++;

  const bound = bindTrustedLocationToYandexRasp([candidate(MOSCOW_ID, 'Москва (Казанский вокзал)')], bindings);
  assert.deepEqual(bound, {
    status: 'bound',
    binding: {
      locationId: MOSCOW_ID,
      searchCode: 's2000003',
      stationCodes: ['s2000003'],
    },
  });
  checks++;

  if (bound.status !== 'bound') throw new Error('Expected bound outcome');
  assert.notStrictEqual(bound.binding.stationCodes, bindings.get(MOSCOW_ID)?.stationCodes);
  assert.equal(Object.isFrozen(bound.binding.stationCodes), true);
  checks++;

  console.log(`Trusted location provider binding smoke passed (${checks} checks).`);
}

main();
