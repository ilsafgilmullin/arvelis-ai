import assert from 'node:assert/strict';
import type { LocationResolutionQueryV1, TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import type { LocationResolutionOutcome } from '../server/travel/locationResolutionService';
import { resolveRoutesForAuthenticatedRequest } from '../server/travel/routesResolutionHttpBoundary';
import { RoutesResolutionService, type RoutesLocationResolver } from '../server/travel/routesResolutionService';

const moscow: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:moscow-kazansky', displayName: 'Москва (Казанский вокзал)', type: 'station', countryCode: 'RU' };
const kazan: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:kazan-pass', displayName: 'Казань-Пасс.', type: 'station', countryCode: 'RU' };
const kazanOther: TravelLocationCandidateV1 = { locationId: 'arvelis:test:station:kazan-other', displayName: 'Казань, другая станция', type: 'station', countryCode: 'RU' };

function outcome(rawLabel: string, candidates: TravelLocationCandidateV1[]): LocationResolutionOutcome {
  const status = candidates.length === 0 ? 'unresolved' : candidates.length === 1 ? 'resolved' : 'ambiguous';
  return { status, response: { version: 1, status, rawLabel, directoryId: 'arvelis-geonames-ru', directoryRevision: 'test-revision', candidates } };
}

class StubResolver implements RoutesLocationResolver {
  constructor(readonly responses: ReadonlyMap<string, LocationResolutionOutcome>) {}
  async resolve(input: unknown): Promise<LocationResolutionOutcome> {
    const query = input as LocationResolutionQueryV1;
    return this.responses.get(query.rawLabel) ?? outcome(query.rawLabel, []);
  }
}

async function request(resolver: RoutesLocationResolver) {
  const service = new RoutesResolutionService(resolver, new Map([
    [moscow.locationId, { searchCode: 's2000003', stationCodes: ['s2000003'] }],
    [kazan.locationId, { searchCode: 's9623141', stationCodes: ['s9623141'] }],
  ]));
  return resolveRoutesForAuthenticatedRequest({
    service,
    request: { version: 1, origin: 'Москва', destination: 'Казань', locale: 'ru-RU', countryCode: 'RU' },
    requestId: 'request:http-boundary',
    signal: new AbortController().signal,
  });
}

async function main(): Promise<void> {
  const ready = await request(new StubResolver(new Map([
    ['Москва', outcome('Москва', [moscow])],
    ['Казань', outcome('Казань', [kazan])],
  ])));
  assert.deepEqual(ready, {
    statusCode: 200,
    body: {
      status: 'ready',
      origin: { locationId: moscow.locationId },
      destination: { locationId: kazan.locationId },
    },
  });
  assert.equal(JSON.stringify(ready).includes('s2000003'), false, 'provider codes must not cross the HTTP boundary');
  assert.equal(JSON.stringify(ready).includes('s9623141'), false, 'provider codes must not cross the HTTP boundary');

  const ambiguous = await request(new StubResolver(new Map([
    ['Москва', outcome('Москва', [moscow])],
    ['Казань', outcome('Казань', [kazan, kazanOther])],
  ])));
  assert.equal(ambiguous.statusCode, 409);
  assert.equal(ambiguous.body.status, 'needs_disambiguation');
  if (ambiguous.body.status === 'needs_disambiguation') {
    assert.equal(ambiguous.body.field, 'destination');
    assert.deepEqual(ambiguous.body.candidates.map((candidate) => candidate.locationId), [kazan.locationId, kazanOther.locationId]);
  }

  const blocked = await request(new StubResolver(new Map([['Москва', outcome('Москва', [])]])));
  assert.deepEqual(blocked, { statusCode: 422, body: { status: 'blocked', field: 'origin', code: 'location_unresolved' } });

  console.log('Routes resolution HTTP boundary smoke passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
