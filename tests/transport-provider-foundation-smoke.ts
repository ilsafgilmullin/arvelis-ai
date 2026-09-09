import assert from 'node:assert/strict';
import { createTripDraft } from '../src/travel/domain';
import {
  createTransportSearchRequest,
  validateTransportSearchResponse,
  type NormalizedTransportRoute,
} from '../src/travel/transportContracts';
import {
  AVIASALES_DATA_API_DESCRIPTOR,
  AVIASALES_SEARCH_API_DESCRIPTOR,
  TUTU_SCHEDULE_DESCRIPTOR,
  YANDEX_RASP_V3_DESCRIPTOR,
  evaluateTransportProviderActivation,
} from '../server/travel/transportProviderPolicy';
import {
  YandexRaspTransportAdapter,
  type YandexRaspClient,
  type YandexRaspLocationResolver,
  type YandexRaspSearchResponse,
} from '../server/travel/providers/yandexRaspAdapter';

function requireRoute(routes: NormalizedTransportRoute[], legId: string): NormalizedTransportRoute {
  const route = routes.find((item) => item.legId === legId);
  assert.ok(route, `Expected route for ${legId}`);
  return route;
}

async function main() {
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.productCompatibility, 'free_public_only');
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.attribution.required, true);
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.attribution.text, 'Данные предоставлены сервисом Яндекс.Расписания');
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.attribution.url, 'https://rasp.yandex.ru/');
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.storagePolicy, 'temporary_cache_only');
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.deeplinkPolicy, 'attribution_only_no_booking');
  assert.equal(YANDEX_RASP_V3_DESCRIPTOR.quota.publishedLimit, null);

  const now = new Date('2026-09-09T08:30:00.000Z');
  const missingOperationalReadiness = evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, {
    productAccessModel: 'free_public',
    termsRecheckedAt: '2026-09-09T08:20:00.000Z',
    credentialsConfigured: false,
    quotaConfirmed: false,
    userInitiatedBookingFlowApproved: false,
  }, now);
  assert.equal(missingOperationalReadiness.eligible, false);
  assert.equal(missingOperationalReadiness.blockers.includes('credentials_missing'), true);
  assert.equal(missingOperationalReadiness.blockers.includes('quota_unconfirmed'), true);

  const freeProductEligible = evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, {
    productAccessModel: 'free_public',
    termsRecheckedAt: '2026-09-09T08:20:00.000Z',
    credentialsConfigured: true,
    quotaConfirmed: true,
    userInitiatedBookingFlowApproved: false,
  }, now);
  assert.deepEqual(freeProductEligible, { eligible: true, blockers: [] });

  const futurePaidProduct = evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, {
    productAccessModel: 'paid_or_restricted',
    termsRecheckedAt: '2026-09-09T08:20:00.000Z',
    credentialsConfigured: true,
    quotaConfirmed: true,
    userInitiatedBookingFlowApproved: false,
  }, now);
  assert.equal(futurePaidProduct.eligible, false);
  assert.equal(futurePaidProduct.blockers.includes('product_access_incompatible'), true);

  const staleTerms = evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, {
    productAccessModel: 'free_public',
    termsRecheckedAt: '2026-09-07T08:20:00.000Z',
    credentialsConfigured: true,
    quotaConfirmed: true,
    userInitiatedBookingFlowApproved: false,
  }, now);
  assert.equal(staleTerms.blockers.includes('terms_review_stale'), true);

  assert.equal(AVIASALES_SEARCH_API_DESCRIPTOR.minimumMau, 50_000);
  assert.equal(AVIASALES_SEARCH_API_DESCRIPTOR.strategyStatus, 'blocked_until_scale_requirement');
  assert.equal(AVIASALES_SEARCH_API_DESCRIPTOR.deeplinkPolicy, 'user_initiated_booking_required');
  assert.equal(AVIASALES_DATA_API_DESCRIPTOR.strategyStatus, 'deferred_insight_source');
  assert.equal(AVIASALES_DATA_API_DESCRIPTOR.capabilities.liveAvailability, false);
  assert.equal(TUTU_SCHEDULE_DESCRIPTOR.strategyStatus, 'deferred_supporting_source');
  assert.equal(TUTU_SCHEDULE_DESCRIPTOR.capabilities.price, false);

  const trip = createTripDraft({
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
    transportPreferences: ['Самолёт'],
    additionalNotes: '',
  }, 'account-provider-foundation', new Date('2026-09-09T08:00:00.000Z'));
  const request = createTransportSearchRequest(trip);

  let resolverCalls = 0;
  const resolver: YandexRaspLocationResolver = {
    async resolvePoint(label) {
      resolverCalls += 1;
      if (label === 'Казань') return { code: 'c43', label };
      if (label === 'Сочи') return { code: 'c239', label };
      return null;
    },
  };

  let clientCalls = 0;
  const client: YandexRaspClient = {
    async searchPointToPoint(searchRequest) {
      clientCalls += 1;
      const outbound = searchRequest.date === '2026-10-01';
      const response: YandexRaspSearchResponse = {
        segments: [
          {
            departure: outbound ? '2026-10-01T06:00:00+03:00' : '2026-10-08T18:00:00+03:00',
            arrival: outbound ? '2026-10-01T08:00:00+03:00' : '2026-10-08T20:00:00+03:00',
            from: { code: searchRequest.fromCode, title: outbound ? 'Казань' : 'Сочи' },
            to: { code: searchRequest.toCode, title: outbound ? 'Сочи' : 'Казань' },
            thread: {
              uid: outbound ? 'SU-OUTBOUND' : 'SU-RETURN',
              number: outbound ? 'SU 100' : 'SU 101',
              transport_type: 'plane',
              carrier: { title: 'Test Carrier' },
            },
            has_transfers: false,
            tickets_info: {
              et_marker: true,
              places: [
                { currency: 'RUB', price: { whole: outbound ? 4863 : 5200, cents: 0 }, name: 'эконом' },
                { currency: 'RUB', price: { whole: outbound ? 7000 : 7300, cents: 50 }, name: 'комфорт' },
              ],
            },
          },
          {
            departure: outbound ? '2026-10-01T09:00:00+03:00' : '2026-10-08T21:00:00+03:00',
            arrival: outbound ? '2026-10-01T15:00:00+03:00' : '2026-10-09T03:00:00+03:00',
            from: { title: outbound ? 'Казань' : 'Сочи' },
            to: { title: outbound ? 'Сочи' : 'Казань' },
            thread: { uid: 'TRANSFER-UNEXPANDED', transport_type: 'train' },
            has_transfers: true,
          },
        ],
      };
      return response;
    },
  };

  const adapter = new YandexRaspTransportAdapter({
    client,
    locationResolver: resolver,
    now: () => new Date('2026-09-09T08:25:00.000Z'),
  });
  const controller = new AbortController();
  const response = await adapter.searchRoutes(request, {
    accountScopeId: trip.ownerScopeId,
    tripId: trip.id,
    locale: 'ru-RU',
    requestId: 'yr-foundation-request-1',
  }, controller.signal);

  assert.equal(clientCalls, 2, 'Adapter foundation must query each exact-date leg separately');
  assert.equal(resolverCalls, 2, 'Location resolver cache should avoid resolving reversed labels twice');
  assert.equal(response.routes.length, 2, 'Unexpanded transfer result must not be misrepresented as a direct normalized route');
  assert.deepEqual(
    validateTransportSearchResponse(response, adapter.id, 'yr-foundation-request-1', request.legs.map((leg) => leg.id)),
    [],
  );

  const outboundRoute = requireRoute(response.routes, 'outbound');
  const returnRoute = requireRoute(response.routes, 'return');
  assert.equal(outboundRoute.price?.amountMinor, 486_300);
  assert.equal(outboundRoute.price?.semantics, 'from');
  assert.equal(returnRoute.price?.amountMinor, 520_000);
  assert.equal(outboundRoute.availability, 'unknown', 'Electronic ticket marker is not seat availability');
  assert.equal(outboundRoute.validUntil, undefined, 'Adapter must not invent provider freshness deadline');
  assert.equal(outboundRoute.sourceUrl, 'https://rasp.yandex.ru/');
  assert.equal('bookingUrl' in (outboundRoute as unknown as Record<string, unknown>), false);

  console.log('transport provider strategy/adapter foundation smoke: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
