import assert from 'node:assert/strict';
import { createTripDraft, type Trip } from '../src/travel/domain';
import {
  compareTransportRoutes,
  createTransportSearchRequest,
  evaluateTransportRoutePolicy,
  getTransportRouteMetrics,
  validateTransportSearchResponse,
  type NormalizedTransportRoute,
  type TransportSearchRequest,
  type TransportSearchResponse,
} from '../src/travel/transportContracts';
import type { TransportProvider, TransportProviderRequestContext } from '../src/travel/providers';
import {
  TransportOrchestrationError,
  TransportOrchestrator,
} from '../server/travel/transportOrchestrator';

function makeTrip(ownerScopeId = 'account-transport-a'): Trip {
  return createTripDraft({
    origin: 'Казань',
    destination: 'Сочи',
    destinationUnknown: false,
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    flexibleDates: false,
    durationDays: 1,
    travelerCount: 2,
    budgetLimitRub: 150000,
    vacationTypes: ['Город'],
    interests: ['Еда'],
    transportPreferences: ['Поезд'],
    additionalNotes: '',
  }, ownerScopeId, new Date('2026-09-09T06:00:00.000Z'));
}

function makeResponse(requestId: string, providerId = 'transport-contract-test'): TransportSearchResponse {
  return {
    version: 1,
    providerId,
    requestId,
    retrievedAt: '2026-09-09T06:30:00.000Z',
    routes: [
      {
        id: 'route-fast',
        providerRouteId: 'provider-fast',
        availability: 'available',
        validUntil: '2026-09-09T08:00:00.000Z',
        price: { amountMinor: 1_200_000, currency: 'RUB' },
        segments: [
          {
            id: 'segment-fast',
            mode: 'flight',
            from: { label: 'Казань', code: 'KZN' },
            to: { label: 'Сочи', code: 'AER' },
            departureAt: '2026-10-01T06:00:00+03:00',
            arrivalAt: '2026-10-01T08:00:00+03:00',
            carrierName: 'Test Air',
            serviceNumber: 'TA100',
          },
        ],
      },
      {
        id: 'route-cheap',
        providerRouteId: 'provider-cheap',
        availability: 'limited',
        validUntil: '2026-09-09T08:00:00.000Z',
        price: { amountMinor: 800_000, currency: 'RUB' },
        segments: [
          {
            id: 'segment-cheap-1',
            mode: 'train',
            from: { label: 'Казань' },
            to: { label: 'Москва' },
            departureAt: '2026-10-01T05:00:00+03:00',
            arrivalAt: '2026-10-01T09:00:00+03:00',
          },
          {
            id: 'segment-cheap-2',
            mode: 'train',
            from: { label: 'Москва' },
            to: { label: 'Сочи' },
            departureAt: '2026-10-01T10:00:00+03:00',
            arrivalAt: '2026-10-01T20:00:00+03:00',
          },
        ],
      },
    ],
  };
}

function requireRoute(response: TransportSearchResponse, index: number): NormalizedTransportRoute {
  const route = response.routes[index];
  assert.ok(route, `Expected route at index ${index}`);
  return route;
}

async function expectTransportError(promise: Promise<unknown>, code: TransportOrchestrationError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof TransportOrchestrationError && error.code === code);
}

async function main() {
  const trip = makeTrip();
  const request = createTransportSearchRequest(trip);
  assert.equal(request.version, 1);
  assert.equal(request.tripId, trip.id);
  assert.equal(request.travelerCount, 2);
  assert.equal(request.legs.length, 2);
  assert.deepEqual(request.legs.map((leg) => leg.id), ['outbound', 'return']);
  assert.equal(request.legs[0]?.fromLabel, 'Казань');
  assert.equal(request.legs[0]?.toLabel, 'Сочи');
  assert.equal('ownerScopeId' in (request as unknown as Record<string, unknown>), false);
  assert.equal('travelers' in (request as unknown as Record<string, unknown>), false);

  const response = makeResponse('transport-request-1');
  assert.deepEqual(validateTransportSearchResponse(response, 'transport-contract-test', 'transport-request-1'), []);
  assert.deepEqual(getTransportRouteMetrics(requireRoute(response, 0)), { durationMinutes: 120, transferCount: 0 });
  assert.deepEqual(getTransportRouteMetrics(requireRoute(response, 1)), { durationMinutes: 900, transferCount: 1 });

  const now = new Date('2026-09-09T07:00:00.000Z');
  assert.deepEqual(compareTransportRoutes(response, 'duration', now), {
    comparable: true,
    criterion: 'duration',
    routeIds: ['route-fast', 'route-cheap'],
  });
  assert.deepEqual(compareTransportRoutes(response, 'price', now), {
    comparable: true,
    criterion: 'price',
    routeIds: ['route-cheap', 'route-fast'],
  });

  const mixedCurrency: TransportSearchResponse = {
    ...response,
    routes: response.routes.map((route) => route.id === 'route-cheap'
      ? { ...route, price: { amountMinor: 8_000, currency: 'EUR' } }
      : route),
  };
  assert.deepEqual(compareTransportRoutes(mixedCurrency, 'price', now), {
    comparable: false,
    criterion: 'price',
    routeIds: ['route-fast', 'route-cheap'],
    reason: 'mixed_currency',
  });

  const stale: TransportSearchResponse = {
    ...response,
    routes: response.routes.map((route) => ({ ...route, validUntil: '2026-09-09T06:59:59.000Z' })),
  };
  assert.equal(evaluateTransportRoutePolicy(requireRoute(stale, 0), stale, now).priceAuthoritative, false);
  assert.equal(compareTransportRoutes(stale, 'duration', now).comparable, false);

  const invalidChronology: TransportSearchResponse = {
    ...response,
    routes: response.routes.map((route) => route.id === 'route-fast'
      ? {
          ...route,
          segments: route.segments.map((segment) => ({
            ...segment,
            arrivalAt: '2026-10-01T05:59:00+03:00',
          })),
        }
      : route),
  };
  assert.equal(
    validateTransportSearchResponse(invalidChronology, 'transport-contract-test', 'transport-request-1')
      .some((error) => error.code === 'chronology_error'),
    true,
  );

  let providerCalls = 0;
  let observedRequest: TransportSearchRequest | undefined;
  let observedContext: TransportProviderRequestContext | undefined;
  const provider: TransportProvider = {
    id: 'transport-contract-test',
    async searchRoutes(providerRequest, context, signal) {
      providerCalls += 1;
      observedRequest = providerRequest;
      observedContext = context;
      assert.equal(signal.aborted, false);
      return makeResponse(context.requestId);
    },
  };

  const orchestrator = new TransportOrchestrator({
    provider,
    timeoutMs: 500,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'transport-request-1',
  });
  const result = await orchestrator.run('account-transport-a', trip);
  assert.equal(providerCalls, 1);
  assert.equal(observedRequest?.tripId, trip.id);
  assert.equal(observedContext?.accountScopeId, 'account-transport-a');
  assert.equal(result.audit.status, 'success');
  assert.equal(result.routePolicies['route-fast']?.scheduleAuthoritative, true);

  await expectTransportError(orchestrator.run('account-transport-b', trip), 'access_denied');
  assert.equal(providerCalls, 1, 'Provider must not run for foreign-owned Trip');

  const flexibleTrip: Trip = {
    ...trip,
    preferences: { ...trip.preferences, flexibleDates: true },
  };
  await expectTransportError(orchestrator.run('account-transport-a', flexibleTrip), 'invalid_input');
  assert.equal(providerCalls, 1, 'Provider must not run when exact dates are unavailable');

  const disconnected = new TransportOrchestrator({
    provider: null,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'transport-request-disconnected',
  });
  await expectTransportError(disconnected.run('account-transport-a', trip), 'not_connected');

  const invalidProvider: TransportProvider = {
    id: 'transport-contract-test',
    async searchRoutes(_providerRequest, context) {
      return { ...invalidChronology, requestId: context.requestId };
    },
  };
  const invalidOrchestrator = new TransportOrchestrator({
    provider: invalidProvider,
    timeoutMs: 500,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'transport-request-invalid',
  });
  await assert.rejects(
    invalidOrchestrator.run('account-transport-a', trip),
    (error: unknown) => error instanceof TransportOrchestrationError
      && error.code === 'invalid_provider_response'
      && error.validationErrors?.some((item) => item.code === 'chronology_error') === true,
  );

  const timeoutProvider: TransportProvider = {
    id: 'transport-timeout-test',
    searchRoutes(_providerRequest, _context, signal) {
      return new Promise<TransportSearchResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('provider aborted')), { once: true });
      });
    },
  };
  const timeoutOrchestrator = new TransportOrchestrator({
    provider: timeoutProvider,
    timeoutMs: 10,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'transport-request-timeout',
  });
  await expectTransportError(timeoutOrchestrator.run('account-transport-a', trip), 'timeout');

  console.log('transport normalized contract/orchestration policy smoke: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
