import assert from 'node:assert/strict';
import type { LocationResolutionQueryV1, TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import type { LocationResolutionOutcome } from '../server/travel/locationResolutionService';
import { RoutesResolutionService, type RoutesLocationResolver } from '../server/travel/routesResolutionService';

const moscow: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:moscow-kazansky', displayName: 'Москва (Казанский вокзал)', type: 'station', countryCode: 'RU' };
const kazan: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:kazan-pass', displayName: 'Казань-Пасс.', type: 'station', countryCode: 'RU' };
const kazanOther: TravelLocationCandidateV1 = { locationId: 'arvelis:test:station:kazan-other', displayName: 'Казань, другая станция', type: 'station', countryCode: 'RU' };

function outcome(rawLabel: string, candidates: TravelLocationCandidateV1[]): LocationResolutionOutcome {
  const status = candidates.length === 0 ? 'unresolved' : candidates.length === 1 ? 'resolved' : 'ambiguous';
  return { status, response: { version: 1, status, rawLabel, directoryId: 'arvelis-geonames-ru', directoryRevision: 'test-revision', candidates } };
}

class StubResolver implements RoutesLocationResolver {
  readonly queries: LocationResolutionQueryV1[] = [];
  constructor(readonly responses: ReadonlyMap<string, LocationResolutionOutcome>) {}
  async resolve(input: unknown): Promise<LocationResolutionOutcome> {
    const query = structuredClone(input) as LocationResolutionQueryV1;
    this.queries.push(query);
    return this.responses.get(query.rawLabel) ?? outcome(query.rawLabel, []);
  }
}

async function main(): Promise<void> {
  const bindings = new Map([
    [moscow.locationId, { searchCode: 's2000003', stationCodes: ['s2000003'] }],
    [kazan.locationId, { searchCode: 's9623141', stationCodes: ['s9623141'] }],
  ]);
  const request = { version: 1 as const, origin: 'Москва', destination: 'Казань', locale: 'ru-RU' as const, countryCode: 'RU' as const };
  const context = { accountScopeId: 'account:test', requestId: 'request:test', signal: new AbortController().signal };

  const readyResolver = new StubResolver(new Map([
    ['Москва', outcome('Москва', [moscow])],
    ['Казань', outcome('Казань', [kazan])],
  ]));
  const ready = await new RoutesResolutionService(readyResolver, bindings).resolve(request, context);
  assert.equal(ready.status, 'ready');
  if (ready.status === 'ready') {
    assert.equal(ready.origin.locationId, moscow.locationId);
    assert.equal(ready.origin.searchCode, 's2000003');
    assert.equal(ready.destination.locationId, kazan.locationId);
    assert.equal(ready.destination.searchCode, 's9623141');
  }
  assert.deepEqual(readyResolver.queries.map((query) => query.rawLabel), ['Москва', 'Казань']);
  assert.ok(readyResolver.queries.every((query) => query.countryCode === 'RU' && query.locale === 'ru-RU' && query.limit === 10));
  assert.ok(readyResolver.queries.every((query) => !Object.hasOwn(query as object, 'searchCode')));

  const ambiguousResponses = new Map<string, LocationResolutionOutcome>([
    ['Москва', outcome('Москва', [moscow])],
    ['Казань', outcome('Казань', [kazan, kazanOther])],
  ]);
  const ambiguousResolver = new StubResolver(ambiguousResponses);
  const ambiguous = await new RoutesResolutionService(ambiguousResolver, bindings).resolve(request, context);
  assert.equal(ambiguous.status, 'needs_disambiguation');
  if (ambiguous.status === 'needs_disambiguation') {
    assert.equal(ambiguous.field, 'destination');
    assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.locationId), [kazan.locationId, kazanOther.locationId]);
  }

  const explicitlySelected = await new RoutesResolutionService(new StubResolver(ambiguousResponses), bindings).resolve(
    { ...request, destinationLocationId: kazan.locationId },
    context,
  );
  assert.equal(explicitlySelected.status, 'ready');
  if (explicitlySelected.status === 'ready') {
    assert.equal(explicitlySelected.destination.locationId, kazan.locationId);
    assert.equal(explicitlySelected.destination.searchCode, 's9623141');
  }

  const staleSelection = await new RoutesResolutionService(new StubResolver(ambiguousResponses), bindings).resolve(
    { ...request, destinationLocationId: 'arvelis:test:station:not-in-current-candidates' },
    context,
  );
  assert.equal(staleSelection.status, 'needs_disambiguation', 'stale/invented ARVELIS IDs must never be trusted');

  const providerCodeSelection = await new RoutesResolutionService(new StubResolver(ambiguousResponses), bindings).resolve(
    { ...request, destinationLocationId: 's9623141' },
    context,
  );
  assert.deepEqual(providerCodeSelection, { status: 'blocked', field: 'origin', code: 'location_resolution_failed' });

  const unresolvedResolver = new StubResolver(new Map([['Москва', outcome('Москва', [])]]));
  const unresolved = await new RoutesResolutionService(unresolvedResolver, bindings).resolve(request, context);
  assert.deepEqual(unresolved, { status: 'blocked', field: 'origin', code: 'location_unresolved' });
  assert.equal(unresolvedResolver.queries.length, 1, 'destination must not resolve after blocked origin');

  const missingBindingResolver = new StubResolver(new Map([
    ['Москва', outcome('Москва', [moscow])],
    ['Казань', outcome('Казань', [kazanOther])],
  ]));
  assert.deepEqual(await new RoutesResolutionService(missingBindingResolver, bindings).resolve(request, context), { status: 'blocked', field: 'destination', code: 'provider_binding_missing' });

  const malicious = { ...request, searchCode: 's2000003' };
  const rejectedResolver = new StubResolver(new Map());
  assert.deepEqual(await new RoutesResolutionService(rejectedResolver, bindings).resolve(malicious, context), { status: 'blocked', field: 'origin', code: 'location_resolution_failed' });
  assert.equal(rejectedResolver.queries.length, 0, 'unknown/provider fields must fail before resolver execution');

  const aborted = new AbortController();
  aborted.abort();
  const abortedResolver = new StubResolver(new Map());
  assert.deepEqual(await new RoutesResolutionService(abortedResolver, bindings).resolve(request, { ...context, signal: aborted.signal }), { status: 'blocked', field: 'origin', code: 'location_resolution_failed' });
  assert.equal(abortedResolver.queries.length, 0);

  console.log('Routes resolution service smoke passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
