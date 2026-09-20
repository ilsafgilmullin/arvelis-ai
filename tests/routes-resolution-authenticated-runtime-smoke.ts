import assert from 'node:assert/strict';
import type { LocationResolutionQueryV1, TravelLocationCandidateV1 } from '../src/travel/locationResolution';
import type { LocationDirectoryContext, LocationResolutionOutcome } from '../server/travel/locationResolutionService';
import { resolveRoutesInAuthenticatedRuntime } from '../server/travel/routesResolutionAuthenticatedRuntime';
import { RoutesResolutionService, type RoutesLocationResolver } from '../server/travel/routesResolutionService';
import type { RoutesResolutionRuntimeState } from '../server/travel/routesResolutionRuntime';

const moscow: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:moscow-kazansky', displayName: 'Москва (Казанский вокзал)', type: 'station', countryCode: 'RU' };
const kazan: TravelLocationCandidateV1 = { locationId: 'arvelis:dev:station:kazan-pass', displayName: 'Казань-Пасс.', type: 'station', countryCode: 'RU' };

function outcome(rawLabel: string, candidate: TravelLocationCandidateV1): LocationResolutionOutcome {
  return {
    status: 'resolved',
    response: {
      version: 1,
      status: 'resolved',
      rawLabel,
      directoryId: 'arvelis-geonames-ru',
      directoryRevision: 'test-revision',
      candidates: [candidate],
    },
  };
}

class StubResolver implements RoutesLocationResolver {
  readonly accountScopes: string[] = [];

  async resolve(input: unknown, context: LocationDirectoryContext): Promise<LocationResolutionOutcome> {
    this.accountScopes.push(context.accountScopeId);
    const query = input as LocationResolutionQueryV1;
    return outcome(query.rawLabel, query.rawLabel === 'Москва' ? moscow : kazan);
  }
}

async function main(): Promise<void> {
  const resolver = new StubResolver();
  const service = new RoutesResolutionService(resolver, new Map([
    [moscow.locationId, { searchCode: 's2000003', stationCodes: ['s2000003'] }],
    [kazan.locationId, { searchCode: 's9623141', stationCodes: ['s9623141'] }],
  ]));
  const readyRuntime: RoutesResolutionRuntimeState = {
    status: 'ready',
    service,
    bindingEnvironment: 'development',
  };
  const signal = new AbortController().signal;
  const body = {
    request: { version: 1, origin: 'Москва', destination: 'Казань', locale: 'ru-RU', countryCode: 'RU' },
  };

  const ready = await resolveRoutesInAuthenticatedRuntime({
    runtime: readyRuntime,
    body,
    accountScopeId: 'account:runtime-smoke',
    requestId: 'request:runtime-smoke',
    signal,
  });
  assert.equal(ready.statusCode, 200);
  assert.equal(JSON.stringify(ready).includes('s2000003'), false);
  assert.equal(JSON.stringify(ready).includes('s9623141'), false);
  assert.deepEqual(resolver.accountScopes, ['account:runtime-smoke', 'account:runtime-smoke']);

  const disabled: RoutesResolutionRuntimeState = {
    status: 'disabled',
    service: null,
    bindingEnvironment: 'production',
    blocker: 'trusted_bindings_unavailable',
  };
  assert.deepEqual(await resolveRoutesInAuthenticatedRuntime({
    runtime: disabled,
    body,
    accountScopeId: 'account:runtime-smoke',
    requestId: 'request:disabled',
    signal,
  }), {
    statusCode: 503,
    body: { error: { code: 'service_unavailable', message: 'Routes resolution unavailable' } },
  });

  assert.deepEqual(await resolveRoutesInAuthenticatedRuntime({
    runtime: readyRuntime,
    body: { request: body.request, searchCode: 's2000003' },
    accountScopeId: 'account:runtime-smoke',
    requestId: 'request:provider-injection',
    signal,
  }), {
    statusCode: 400,
    body: { error: { code: 'invalid_input', message: 'Invalid routes resolution request' } },
  });

  assert.deepEqual(await resolveRoutesInAuthenticatedRuntime({
    runtime: readyRuntime,
    body: Object.create(null) as unknown,
    accountScopeId: 'account:runtime-smoke',
    requestId: 'request:exotic-envelope',
    signal,
  }), {
    statusCode: 400,
    body: { error: { code: 'invalid_input', message: 'Invalid routes resolution request' } },
  });

  console.log('Routes authenticated runtime boundary smoke passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
