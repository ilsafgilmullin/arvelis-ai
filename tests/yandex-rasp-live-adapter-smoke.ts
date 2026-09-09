import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createTripDraft } from '../src/travel/domain';
import { TransportOrchestrator, TransportOrchestrationError } from '../server/travel/transportOrchestrator';
import { createYandexRaspLiveProvider } from '../server/travel/providers/yandexRaspLiveProvider';

const FAKE_TEST_KEY = 'fake-yandex-key-for-local-stub-only';

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(value));
}

async function expectTransportError(promise: Promise<unknown>, code: TransportOrchestrationError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof TransportOrchestrationError && error.code === code);
}

async function main() {
  const now = () => new Date('2026-09-09T09:30:00.000Z');
  const commonEnv = {
    YANDEX_RASP_TERMS_RECHECKED_AT: '2026-09-09T09:30:00.000Z',
    YANDEX_RASP_QUOTA_CONFIRMED: 'true',
  };

  const disabled = createYandexRaspLiveProvider({ env: commonEnv, now });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.provider, null);
  assert.equal(disabled.blockers.includes('credentials_missing'), true);
  assert.equal(disabled.attribution.text, 'Данные предоставлены сервисом Яндекс.Расписания');
  assert.equal(disabled.cachePolicy.persistence, 'temporary_memory_only');

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
  }, 'account-yandex-live', new Date('2026-09-09T09:00:00.000Z'));

  const disabledOrchestrator = new TransportOrchestrator({
    provider: disabled.provider,
    now,
    requestId: () => 'yandex-disabled-request',
  });
  await expectTransportError(disabledOrchestrator.run('account-yandex-live', trip), 'not_connected');

  let stationListCalls = 0;
  let searchCalls = 0;
  const seenDates: string[] = [];

  const handler = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    assert.equal(url.searchParams.has('apikey'), false, 'API key must never be placed in the URL');
    if (request.headers.authorization !== FAKE_TEST_KEY) {
      json(response, 401, { error: 'unauthorized' });
      return;
    }

    if (url.pathname === '/v3.0/stations_list/') {
      stationListCalls += 1;
      json(response, 200, {
        countries: [{
          title: 'Россия',
          regions: [{
            title: 'Тестовый регион',
            settlements: [
              { title: 'Казань', codes: { yandex_code: 'c43' }, stations: [] },
              { title: 'Сочи', codes: { yandex_code: 'c239' }, stations: [] },
            ],
          }],
        }],
      });
      return;
    }

    if (url.pathname === '/v3.0/search/') {
      searchCalls += 1;
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const date = url.searchParams.get('date');
      assert.ok(from === 'c43' || from === 'c239');
      assert.ok(to === 'c43' || to === 'c239');
      assert.ok(date === '2026-10-01' || date === '2026-10-08');
      assert.equal(url.searchParams.get('transfers'), 'false');
      assert.equal(url.searchParams.get('format'), 'json');
      assert.equal(url.searchParams.get('lang'), 'ru_RU');
      seenDates.push(date);
      const outbound = from === 'c43';
      json(response, 200, {
        pagination: { total: 1, limit: 100, offset: 0 },
        segments: [{
          departure: outbound ? '2026-10-01T06:00:00+03:00' : '2026-10-08T18:00:00+03:00',
          arrival: outbound ? '2026-10-01T09:30:00+03:00' : '2026-10-08T21:30:00+03:00',
          from: { code: from, title: outbound ? 'Казань' : 'Сочи' },
          to: { code: to, title: outbound ? 'Сочи' : 'Казань' },
          has_transfers: false,
          thread: {
            uid: outbound ? 'test-outbound' : 'test-return',
            number: outbound ? 'YA100' : 'YA101',
            transport_type: 'plane',
            carrier: { title: 'Тестовый перевозчик' },
          },
          tickets_info: {
            et_marker: true,
            places: [
              { currency: 'RUB', price: { whole: 12500, cents: 0 }, name: 'Эконом' },
              { currency: 'RUB', price: { whole: 10000, cents: 50 }, name: 'Минимальный тариф' },
            ],
          },
        }],
      });
      return;
    }

    json(response, 404, { error: 'not_found' });
  };

  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/v3.0/`;

  try {
    const live = createYandexRaspLiveProvider({
      env: { ...commonEnv, YANDEX_RASP_API_KEY: FAKE_TEST_KEY },
      now,
      baseUrl,
      allowInsecureTestEndpoint: true,
      searchCacheTtlMs: 60_000,
      locationDirectoryTtlMs: 60_000,
    });
    assert.equal(live.status, 'ready');
    assert.ok(live.provider);
    assert.deepEqual(live.blockers, []);
    assert.equal(live.attribution.url, 'https://rasp.yandex.ru/');

    let requestCounter = 0;
    const orchestrator = new TransportOrchestrator({
      provider: live.provider,
      now,
      requestId: () => `yandex-live-request-${++requestCounter}`,
    });

    const first = await orchestrator.run('account-yandex-live', trip);
    assert.equal(first.response.routes.length, 2);
    assert.deepEqual(first.response.routes.map((route) => route.legId).sort(), ['outbound', 'return']);
    assert.equal(stationListCalls, 1, 'Location directory must use one temporary snapshot for concurrent resolutions');
    assert.equal(searchCalls, 2, 'Outbound and return each require one provider search');
    assert.deepEqual(seenDates.sort(), ['2026-10-01', '2026-10-08']);

    for (const route of first.response.routes) {
      assert.equal(route.availability, 'unknown', 'et_marker must not be treated as seat availability');
      assert.equal(route.price?.amountMinor, 1_000_050);
      assert.equal(route.price?.currency, 'RUB');
      assert.equal(route.price?.semantics, 'from');
      assert.equal(route.validUntil, undefined, 'ARVELIS must not invent provider validity');
      assert.equal(route.sourceUrl, 'https://rasp.yandex.ru/');
      assert.equal(first.routePolicies[route.id]?.freshness, 'unspecified');
      assert.equal(first.routePolicies[route.id]?.scheduleAuthoritative, false);
      assert.equal(first.routePolicies[route.id]?.availabilityAuthoritative, false);
    }

    const firstRetrievedAt = first.response.retrievedAt;
    const second = await orchestrator.run('account-yandex-live', trip);
    assert.equal(second.response.requestId, 'yandex-live-request-2');
    assert.equal(second.response.retrievedAt, firstRetrievedAt, 'Temporary cache must preserve source retrieval provenance');
    assert.equal(stationListCalls, 1);
    assert.equal(searchCalls, 2, 'Second identical search must be served from bounded temporary memory cache');
  } finally {
    server.close();
    await once(server, 'close');
  }

  console.log('yandex rasp live adapter HTTP/mapping/freshness smoke: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
