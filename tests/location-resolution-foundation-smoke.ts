import assert from 'node:assert/strict';
import {
  candidateToTransportSearchLocation,
  validLocationResolutionResponseV1,
  validTravelLocationCandidateV1,
  validateLocationResolutionQueryV1,
  type LocationResolutionQueryV1,
  type TravelLocationCandidateV1,
} from '../src/travel/locationResolution';
import {
  LocationDirectoryError,
  LocationResolutionService,
  type TravelLocationDirectory,
} from '../server/travel/locationResolutionService';

const QUERY: LocationResolutionQueryV1 = {
  version: 1,
  rawLabel: 'Казань',
  locale: 'ru-RU',
  countryCode: 'RU',
  types: ['city', 'station'],
  limit: 5,
};

const CITY: TravelLocationCandidateV1 = {
  locationId: 'arvelis:location:kazan',
  displayName: 'Казань',
  type: 'city',
  countryCode: 'RU',
  region: 'Республика Татарстан',
  timezone: 'Europe/Moscow',
};

const STATION: TravelLocationCandidateV1 = {
  locationId: 'arvelis:location:kazan-pass',
  displayName: 'Казань-Пасс.',
  type: 'station',
  countryCode: 'RU',
  region: 'Республика Татарстан',
  timezone: 'Europe/Moscow',
};

function context(signal = new AbortController().signal) {
  return { accountScopeId: 'account-location-smoke', requestId: 'location-request-1', signal };
}

async function run() {
  assert.equal(validateLocationResolutionQueryV1(QUERY).ok, true);
  assert.equal(validateLocationResolutionQueryV1(undefined).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, locale: 'en-US' }).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, countryCode: 'ru' }).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, types: ['city', 'city'] }).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, types: ['hotel'] }).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, limit: 11 }).ok, false);
  assert.equal(validateLocationResolutionQueryV1({ ...QUERY, providerCode: 'c43' }).ok, false);

  const cyclic: Record<string, unknown> = { version: 1, rawLabel: 'Казань', locale: 'ru-RU' };
  cyclic.self = cyclic;
  assert.equal(validateLocationResolutionQueryV1(cyclic).ok, false);

  assert.equal(validTravelLocationCandidateV1(CITY), true);
  assert.equal(validTravelLocationCandidateV1({ ...CITY, providerCode: 'c43' }), false, 'provider-specific codes must not cross the ARVELIS location contract');
  assert.equal(validTravelLocationCandidateV1({ ...CITY, locationId: 'c43' }), false);
  assert.equal(validTravelLocationCandidateV1({ ...CITY, timezone: 'Mars/Olympus' }), false);

  let calls = 0;
  const exactDirectory: TravelLocationDirectory = {
    id: 'reviewed-location-directory',
    revision: '2026-09-16.1',
    async resolve(query, directoryContext) {
      calls += 1;
      assert.deepEqual(query, QUERY);
      assert.equal(directoryContext.accountScopeId, 'account-location-smoke');
      assert.equal(directoryContext.requestId, 'location-request-1');
      assert.equal(directoryContext.signal.aborted, false);
      return [CITY];
    },
  };
  const exact = await new LocationResolutionService(exactDirectory).resolve(QUERY, context());
  assert.equal(exact.status, 'resolved');
  assert.equal(calls, 1);
  assert.ok('response' in exact);
  assert.equal(validLocationResolutionResponseV1(exact.response), true);
  assert.deepEqual(exact.response.candidates, [CITY]);
  assert.equal('providerCode' in exact.response.candidates[0]!, false);

  const selected = candidateToTransportSearchLocation('Казань', CITY);
  assert.deepEqual(selected, {
    rawLabel: 'Казань',
    type: 'city',
    resolution: 'resolved',
    displayName: 'Казань',
    locationId: 'arvelis:location:kazan',
    countryCode: 'RU',
    region: 'Республика Татарстан',
  });

  const ambiguousDirectory: TravelLocationDirectory = {
    id: 'reviewed-location-directory',
    revision: '2026-09-16.1',
    async resolve() { return [CITY, STATION]; },
  };
  const ambiguous = await new LocationResolutionService(ambiguousDirectory).resolve(QUERY, context());
  assert.equal(ambiguous.status, 'ambiguous');
  assert.ok('response' in ambiguous);
  assert.equal(ambiguous.response.candidates.length, 2);

  const unresolvedDirectory: TravelLocationDirectory = {
    id: 'reviewed-location-directory',
    revision: '2026-09-16.1',
    async resolve() { return []; },
  };
  const unresolved = await new LocationResolutionService(unresolvedDirectory).resolve(QUERY, context());
  assert.equal(unresolved.status, 'unresolved');
  assert.ok('response' in unresolved);
  assert.deepEqual(unresolved.response.candidates, []);

  const missing = await new LocationResolutionService(null).resolve(QUERY, context());
  assert.deepEqual(missing, { status: 'not_executed', code: 'resolver_not_configured' });

  let invalidCalls = 0;
  const invalidInput = await new LocationResolutionService({
    id: 'unused', revision: '1', async resolve() { invalidCalls += 1; return []; },
  }).resolve({ ...QUERY, limit: 0 }, context());
  assert.deepEqual(invalidInput, { status: 'not_executed', code: 'invalid_location_query' });
  assert.equal(invalidCalls, 0);

  const overLimit = await new LocationResolutionService({
    id: 'reviewed-location-directory', revision: '1', async resolve() { return [CITY, STATION]; },
  }).resolve({ ...QUERY, limit: 1 }, context());
  assert.deepEqual(overLimit, { status: 'failed', code: 'malformed_resolver_response' });

  const duplicate = await new LocationResolutionService({
    id: 'reviewed-location-directory', revision: '1', async resolve() { return [CITY, CITY]; },
  }).resolve(QUERY, context());
  assert.deepEqual(duplicate, { status: 'failed', code: 'malformed_resolver_response' });

  const providerLeak = await new LocationResolutionService({
    id: 'reviewed-location-directory', revision: '1', async resolve() { return [{ ...CITY, providerCode: 'c43' }]; },
  }).resolve(QUERY, context());
  assert.deepEqual(providerLeak, { status: 'failed', code: 'malformed_resolver_response' });

  const badDirectoryIdentity = await new LocationResolutionService({
    id: 'bad directory id', revision: '1', async resolve() { return [CITY]; },
  }).resolve(QUERY, context());
  assert.deepEqual(badDirectoryIdentity, { status: 'failed', code: 'malformed_resolver_response' });

  const rateLimited = await new LocationResolutionService({
    id: 'reviewed-location-directory', revision: '1', async resolve() { throw new LocationDirectoryError('rate_limited'); },
  }).resolve(QUERY, context());
  assert.deepEqual(rateLimited, { status: 'failed', code: 'resolver_rate_limited' });

  const unavailable = await new LocationResolutionService({
    id: 'reviewed-location-directory', revision: '1', async resolve() { throw new Error('raw upstream detail must not escape'); },
  }).resolve(QUERY, context());
  assert.deepEqual(unavailable, { status: 'failed', code: 'resolver_unavailable' });

  const preAbortedController = new AbortController();
  preAbortedController.abort();
  const preAborted = await new LocationResolutionService(exactDirectory).resolve(QUERY, context(preAbortedController.signal));
  assert.deepEqual(preAborted, { status: 'not_executed', code: 'aborted' });

  const timeoutDirectory: TravelLocationDirectory = {
    id: 'reviewed-location-directory',
    revision: '1',
    resolve(_query, directoryContext) {
      return new Promise((_resolve, reject) => {
        directoryContext.signal.addEventListener('abort', () => reject(new Error('aborted upstream')), { once: true });
      });
    },
  };
  const timedOut = await new LocationResolutionService(timeoutDirectory, { timeoutMs: 250 }).resolve(QUERY, context());
  assert.deepEqual(timedOut, { status: 'failed', code: 'resolver_timeout' });

  const callerController = new AbortController();
  const callerPromise = new LocationResolutionService(timeoutDirectory, { timeoutMs: 1_000 }).resolve(QUERY, context(callerController.signal));
  callerController.abort();
  assert.deepEqual(await callerPromise, { status: 'failed', code: 'aborted' });

  assert.throws(() => new LocationResolutionService(null, { timeoutMs: 10 }));
  assert.throws(() => candidateToTransportSearchLocation(' Казань ', CITY));

  console.log('Location Resolution Foundation V1: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
