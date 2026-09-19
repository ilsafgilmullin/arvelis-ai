import assert from 'node:assert/strict';
import type { TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import type { LocationResolutionOutcome } from '../server/travel/locationResolutionService';
import { prepareRoutesLocationsForYandexRasp } from '../server/travel/routesLocationBoundary';

const moscow: TravelLocationCandidateV1 = {
  locationId: 'arvelis:station:moscow-kazanskaya',
  displayName: 'Москва (Казанский вокзал)',
  type: 'station',
  countryCode: 'RU',
};
const kazan: TravelLocationCandidateV1 = {
  locationId: 'arvelis:station:kazan-pass',
  displayName: 'Казань-Пасс.',
  type: 'station',
  countryCode: 'RU',
};
const other: TravelLocationCandidateV1 = {
  locationId: 'arvelis:station:other',
  displayName: 'Другая станция',
  type: 'station',
  countryCode: 'RU',
};

const resolved = (rawLabel: string, candidate: TravelLocationCandidateV1): LocationResolutionOutcome => ({
  status: 'resolved',
  response: {
    version: 1,
    status: 'resolved',
    rawLabel,
    directoryId: 'arvelis-geonames-ru',
    directoryRevision: 'test-revision',
    candidates: [candidate],
  },
});
const ambiguous: LocationResolutionOutcome = {
  status: 'ambiguous',
  response: {
    version: 1,
    status: 'ambiguous',
    rawLabel: 'Казань',
    directoryId: 'arvelis-geonames-ru',
    directoryRevision: 'test-revision',
    candidates: [kazan, other],
  },
};
const bindings = new Map([
  [moscow.locationId, { searchCode: 's2000003', stationCodes: ['s2000003'] }],
  [kazan.locationId, { searchCode: 's9602494', stationCodes: ['s9602494'] }],
]);

const ready = prepareRoutesLocationsForYandexRasp(resolved('Москва', moscow), resolved('Казань', kazan), bindings);
assert.equal(ready.status, 'ready');
if (ready.status === 'ready') {
  assert.equal(ready.origin.searchCode, 's2000003');
  assert.equal(ready.destination.searchCode, 's9602494');
}

const disambiguation = prepareRoutesLocationsForYandexRasp(resolved('Москва', moscow), ambiguous, bindings);
assert.equal(disambiguation.status, 'needs_disambiguation');
if (disambiguation.status === 'needs_disambiguation') {
  assert.equal(disambiguation.field, 'destination');
  assert.deepEqual(disambiguation.candidates.map((candidate) => candidate.locationId), [kazan.locationId, other.locationId]);
}

const missingBinding = prepareRoutesLocationsForYandexRasp(resolved('Другая', other), resolved('Казань', kazan), bindings);
assert.deepEqual(missingBinding, { status: 'blocked', field: 'origin', code: 'provider_binding_missing' });

const resolverFailure = prepareRoutesLocationsForYandexRasp(
  { status: 'failed', code: 'resolver_unavailable' },
  resolved('Казань', kazan),
  bindings,
);
assert.deepEqual(resolverFailure, { status: 'blocked', field: 'origin', code: 'location_resolution_failed' });

const sameLocation = prepareRoutesLocationsForYandexRasp(resolved('Москва', moscow), resolved('Москва', moscow), bindings);
assert.deepEqual(sameLocation, { status: 'blocked', field: 'destination', code: 'location_unresolved' });

console.log('Routes location boundary smoke passed');
