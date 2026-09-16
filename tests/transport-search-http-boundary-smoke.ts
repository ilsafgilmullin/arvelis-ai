import assert from 'node:assert/strict';
import type { Trip } from '../src/travel/domain';
import type { TransportSearchResponse } from '../src/travel/transportContracts';
import type { TransportSearchRequestV1 } from '../src/travel/transportSearchRequest';
import { searchTransportForAuthorizedTrip, transportHttpFailure } from '../server/travel/transportSearchHttpBoundary';
import { TransportSearchService, type NormalizedTransportProvider } from '../server/travel/transportSearchService';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const REQUEST: TransportSearchRequestV1 = {
  version: 1,
  origin: { resolution: 'resolved', type: 'station', rawLabel: 'Казанский вокзал, Москва', displayName: 'Казанский вокзал, Москва', locationId: 'arvelis:dev:station:moscow-kazansky' },
  destination: { resolution: 'resolved', type: 'station', rawLabel: 'Казань-Пасс.', displayName: 'Казань-Пасс.', locationId: 'arvelis:dev:station:kazan-pass' },
  departureDate: '2026-09-23',
  returnDate: '2026-09-26',
  passengers: { adults: 1 },
  allowedModes: ['train'],
  preferredMode: 'train',
  locale: 'ru-RU',
  timezone: 'Europe/Moscow',
  preferredCurrency: 'RUB',
  constraints: { maxTransfers: 0 },
};

const TRIP: Trip = {
  id: 'trip-http-boundary',
  ownerScopeId: 'account-http-boundary',
  title: 'Москва — Казань',
  origin: REQUEST.origin.rawLabel,
  destination: REQUEST.destination.rawLabel,
  startDate: REQUEST.departureDate,
  endDate: REQUEST.returnDate,
  durationDays: 4,
  travelers: [{ id: 'traveler-1', label: 'Путешественник 1' }],
  status: 'planning',
  preferences: {
    vacationTypes: [], interests: [], transportPreferences: ['train'], additionalNotes: '', flexibleDates: false, destinationUnknown: false,
  },
  destinationOptions: [], transportRoutes: [], itinerary: [],
  budget: { currency: 'RUB', limitRub: 50_000, reserveRub: 0, items: [] },
  legalChecks: [], mapPoints: [],
  tripBook: { id: 'trip-book-http-boundary', sections: [] },
  createdAt: '2026-09-16T10:00:00.000Z',
  updatedAt: '2026-09-16T10:00:00.000Z',
};

let providerCalls = 0;
const provider: NormalizedTransportProvider = {
  id: 'synthetic-http-provider',
  supportedModes: ['train'],
  maxTransfers: 0,
  sourceUrl: 'https://synthetic.example.test/transport',
  activation: { kind: 'synthetic', label: 'SYNTHETIC EVALUATION ONLY' },
  async search(input, context): Promise<TransportSearchResponse> {
    providerCalls += 1;
    assert.deepEqual(input, REQUEST);
    assert.equal(context.accountScopeId, TRIP.ownerScopeId);
    assert.equal(context.authorizedTripId, TRIP.id);
    return {
      version: 1,
      providerId: 'synthetic-http-provider',
      requestId: context.requestId,
      retrievedAt: NOW.toISOString(),
      routes: [{
        id: 'route-http-1',
        legId: 'outbound',
        providerRouteId: 'provider-route-http-1',
        availability: 'unknown',
        validUntil: new Date(NOW.getTime() + 60_000).toISOString(),
        segments: [{
          id: 'segment-http-1',
          mode: 'train',
          from: { label: REQUEST.origin.rawLabel, locationId: REQUEST.origin.locationId },
          to: { label: REQUEST.destination.rawLabel, locationId: REQUEST.destination.locationId },
          departureAt: '2026-09-23T18:00:00+03:00',
          arrivalAt: '2026-09-24T06:00:00+03:00',
        }],
      }],
    };
  },
};

const service = (adapter: NormalizedTransportProvider | null = provider) => new TransportSearchService(adapter, { now: () => NOW, timeoutMs: 1_000 });
const signal = () => new AbortController().signal;

async function run() {
  const valid = await searchTransportForAuthorizedTrip({
    service: service(), accountScopeId: TRIP.ownerScopeId, trip: TRIP, input: REQUEST,
    requestId: 'http-search-1', signal: signal(), now: NOW,
  });
  assert.equal(valid.status, 'results');
  assert.equal(providerCalls, 1);
  assert.ok('response' in valid);
  assert.equal(valid.response.routes[0]?.segments[0]?.from.locationId, REQUEST.origin.locationId);

  for (const [label, trip, input, expected] of [
    ['owner mismatch', TRIP, REQUEST, 'access_denied'],
    ['origin mismatch', TRIP, { ...REQUEST, origin: { ...REQUEST.origin, rawLabel: 'Сочи' } }, 'trip_mismatch'],
    ['date mismatch', TRIP, { ...REQUEST, departureDate: '2026-09-24' }, 'trip_mismatch'],
    ['passenger mismatch', TRIP, { ...REQUEST, passengers: { adults: 2 } }, 'trip_mismatch'],
    ['trip flexible', { ...TRIP, preferences: { ...TRIP.preferences, flexibleDates: true } }, REQUEST, 'trip_not_ready'],
    ['trip destination unknown', { ...TRIP, preferences: { ...TRIP.preferences, destinationUnknown: true } }, REQUEST, 'trip_not_ready'],
  ] as const) {
    const before = providerCalls;
    const result = await searchTransportForAuthorizedTrip({
      service: service(),
      accountScopeId: label === 'owner mismatch' ? 'other-account' : TRIP.ownerScopeId,
      trip: trip as Trip,
      input,
      requestId: `http-${label.replaceAll(' ', '-')}`,
      signal: signal(),
      now: NOW,
    });
    assert.ok('code' in result, label);
    assert.equal(result.code, expected, label);
    assert.equal(providerCalls, before, `${label}: provider must not execute`);
  }

  const unresolved = { ...REQUEST, origin: { resolution: 'unresolved' as const, type: 'station' as const, rawLabel: REQUEST.origin.rawLabel } };
  const unresolvedResult = await searchTransportForAuthorizedTrip({
    service: service(), accountScopeId: TRIP.ownerScopeId, trip: TRIP, input: unresolved,
    requestId: 'http-unresolved', signal: signal(), now: NOW,
  });
  assert.ok('code' in unresolvedResult);
  assert.equal(unresolvedResult.code, 'unresolved_location');

  const disconnected = await searchTransportForAuthorizedTrip({
    service: service(null), accountScopeId: TRIP.ownerScopeId, trip: TRIP, input: REQUEST,
    requestId: 'http-disconnected', signal: signal(), now: NOW,
  });
  assert.ok('code' in disconnected);
  assert.equal(disconnected.code, 'provider_not_configured');
  assert.deepEqual(transportHttpFailure(disconnected), {
    statusCode: 503,
    body: { status: 'not_executed', error: { code: 'provider_not_configured', message: 'Transport provider is not configured' } },
  });

  assert.equal(transportHttpFailure({ status: 'failed', code: 'provider_timeout' }).statusCode, 504);
  assert.equal(transportHttpFailure({ status: 'failed', code: 'provider_rate_limited' }).statusCode, 429);
  assert.equal(transportHttpFailure({ status: 'failed', code: 'malformed_provider_response' }).statusCode, 502);
  assert.equal(transportHttpFailure({ status: 'not_executed', code: 'trip_mismatch' }).statusCode, 422);

  console.log('Trip-bound transport HTTP boundary: PASS');
}

await run();
