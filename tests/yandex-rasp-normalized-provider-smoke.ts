import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createYandexRaspNormalizedProvider, YandexRaspRateBudget, YANDEX_SCHEDULE_FRESHNESS, type YandexProviderTelemetry } from '../server/travel/providers/yandexRaspNormalizedProvider';
import { YandexRaspHttpClient, YandexRaspHttpError } from '../server/travel/providers/yandexRaspHttpClient';
import { mapYandexSearchRequest } from '../server/travel/providers/yandexRaspSearchMapping';
import { registerTransportSearchTool, TransportSearchService, type TransportSearchOutcome, type TransportSearchContext } from '../server/travel/transportSearchService';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import { AiGateway, AiGatewayError } from '../server/travel/aiGateway';
import { QwenLlamaCppRuntime } from '../server/travel/runtimes/qwenLlamaCppRuntime';
import { syntheticTransportSearch } from '../server/travel/testing/syntheticTransportSearch';
import type { TransportSearchRequestV1 } from '../src/travel/transportSearchRequest';

// Fabricated provider-shaped fixtures and credential; no external API call in this suite.
const NOW = new Date('2026-09-15T10:00:00.000Z');
const KEY = 'fixture-only-not-a-real-credential';
const request = syntheticTransportSearch(NOW);
const bindings = new Map([['arvelis:synthetic-origin', { searchCode: 'c213', stationCodes: ['s213'] }], ['arvelis:synthetic-destination', { searchCode: 'c43', stationCodes: ['s43'] }]]);
const env = { YANDEX_RASP_API_KEY: KEY, YANDEX_RASP_NETWORK_ENABLED: 'true', YANDEX_RASP_FREE_PUBLIC_CONFIRMED: 'true', YANDEX_RASP_TERMS_RECHECKED_AT: NOW.toISOString(), YANDEX_RASP_QUOTA_CONFIRMED: 'true', YANDEX_RASP_ATTRIBUTION_IMPLEMENTED: 'true', YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED: 'true' };
const context = (signal = new AbortController().signal): TransportSearchContext => ({ requestId: 'fixture-live-provider', accountScopeId: 'fixture-account', authorizedTripId: 'fixture-trip', signal });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function page(url: URL, count = 1, total = count) {
  const date = url.searchParams.get('date')!; const mode = url.searchParams.get('transport_types')!;
  const offset = Number(url.searchParams.get('offset')); const from = url.searchParams.get('from')!; const to = url.searchParams.get('to')!;
  return { pagination: { total, limit: Number(url.searchParams.get('limit')), offset },
    search: { date, from: { code: from, type: 'settlement', title: 'Fixture origin' }, to: { code: to, type: 'settlement', title: 'Fixture destination' } },
    interval_segments: [] as unknown[], segments: Array.from({ length: count }, (_, i) => ({
      from: { code: from.replace('c', 's'), title: 'Fixture origin', type: 'station' }, to: { code: to.replace('c', 's'), title: 'Fixture destination', type: 'station' },
      departure: `${date}T18:00:00+03:00`, arrival: `${date}T22:00:00+03:00`, duration: 14400, has_transfers: false,
      thread: { uid: `fixture-${mode}-${offset + i}`, transport_type: mode, number: 'T001', carrier: { title: 'Fixture carrier' } },
      tickets_info: { et_marker: true, places: [{ currency: 'RUB', price: { whole: 12345, cents: 50 } }] },
    })) };
}
function setup(fetcher: (url: URL, init: RequestInit) => Promise<Response> | Response = (url) => json(page(url)), overrides: Record<string, string> = {}, clock = () => NOW) {
  const calls: URL[] = []; const events: YandexProviderTelemetry[] = [];
  const state = createYandexRaspNormalizedProvider({ env: { ...env, ...overrides }, bindings, now: clock, budget: new YandexRaspRateBudget(() => clock().getTime()),
    telemetry: (e) => events.push(e), fetchImpl: async (u, init) => {
      const url = new URL(String(u)); calls.push(url);
      assert.equal(url.origin, 'https://api.rasp.yandex-net.ru'); assert.equal(url.pathname, '/v3.0/search/');
      assert.equal(url.searchParams.has('apikey'), false); assert.equal(String(url).includes(KEY), false);
      assert.equal(new Headers(init?.headers).get('Authorization'), KEY);
      assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
      return fetcher(url, init!);
    } });
  return { state, calls, events, service: new TransportSearchService(state.provider, { now: clock }) };
}
function code(outcome: TransportSearchOutcome, expected: string) {
  assert.ok('code' in outcome); assert.equal(outcome.code, expected);
  assert.equal(JSON.stringify(outcome).includes(KEY), false);
}

async function main() {
  let checks = 0;
  for (const mode of ['train', 'flight', 'bus', 'suburbanRail', 'ferry'] as const) {
    const h = setup(); const result = await h.service.search({ ...request, allowedModes: [mode] }, context());
    assert.equal(result.status, 'results'); assert.ok('response' in result);
    const route = result.response.routes[0]!;
    assert.equal(route.segments[0]!.mode, mode); assert.equal(route.segments[0]!.departureAt.endsWith('+03:00'), true);
    assert.equal(route.price?.semantics, 'cached_observation'); assert.equal(route.price?.currency, 'RUB');
    assert.equal(route.price?.amountMinor, 1234550); assert.equal(route.availability, 'unknown');
    assert.equal(result.evidence.find((e) => e.domain === 'price')!.freshness, 'unknown');
    const evidence = result.evidence.find((e) => e.domain === 'transport_schedule')!;
    assert.equal(evidence.freshness, 'current'); assert.equal(evidence.providerId, 'yandex-rasp-v3');
    assert.equal(evidence.provenance?.requestId, context().requestId); assert.equal(evidence.provenance?.dataKind, 'provider');
    assert.equal(evidence.retrievedAt, route.retrievedAt); assert.equal(evidence.expiresAt, route.validUntil);
    assert.equal(result.response.metadata!.attribution.bannerRequired, true);
    assert.equal(result.response.metadata!.freshnessPolicy.providerGuarantee, false);
    assert.equal(h.events.length, 1); assert.equal(h.events[0]!.pages, 1);
    assert.equal(JSON.stringify([result, h.events, h.state]).includes(KEY), false);
    checks++;
  }
  for (const gate of ['YANDEX_RASP_API_KEY', 'YANDEX_RASP_NETWORK_ENABLED', 'YANDEX_RASP_FREE_PUBLIC_CONFIRMED', 'YANDEX_RASP_TERMS_RECHECKED_AT', 'YANDEX_RASP_QUOTA_CONFIRMED', 'YANDEX_RASP_ATTRIBUTION_IMPLEMENTED', 'YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED']) {
    const h = setup(undefined, { [gate]: '' }); assert.equal(h.state.status, 'disabled');
    code(await h.service.search(request, context()), 'provider_not_configured'); assert.equal(h.calls.length, 0); checks++;
  }
  const noResult = setup((url) => json(page(url, 0)));
  assert.equal((await noResult.service.search(request, context())).status, 'no_results'); checks++;
  const roundClock = { value: NOW };
  const round = setup((url) => { roundClock.value = new Date(roundClock.value.getTime() + 1000); return json(page(url)); }, {}, () => roundClock.value);
  const roundResult = await round.service.search({ ...request, returnDate: request.departureDate }, context());
  assert.ok('response' in roundResult); assert.deepEqual(roundResult.response.routes.map((r) => r.legId), ['outbound', 'return']);
  assert.notEqual(roundResult.response.routes[0]!.retrievedAt, roundResult.response.routes[1]!.retrievedAt);
  assert.equal(round.calls[1]!.searchParams.get('from'), 'c43'); checks++;
  const pages = setup((url) => json(page(url, url.searchParams.get('offset') === '0' ? 10 : 2, 12)));
  const paged = await pages.service.search(request, context()); assert.ok('response' in paged);
  assert.equal(paged.response.routes.length, 12); assert.equal(paged.response.metadata!.coverage.status, 'complete'); assert.equal(pages.calls.length, 2); checks++;
  const cap = setup((url) => json(page(url, 10, 1000)));
  const capped = await cap.service.search(request, context()); assert.ok('response' in capped);
  assert.equal(capped.response.routes.length, 20); assert.equal(capped.response.metadata!.coverage.status, 'partial'); assert.equal(cap.calls.length, 2); checks++;
  const intervalPage = (url: URL, only = false) => {
    const p = page(url); const segment = { ...p.segments[0]!, thread: { ...p.segments[0]!.thread, interval: { density: 'Fixture every 10 minutes', begin_time: `${request.departureDate}T06:00:00`, end_time: `${request.departureDate}T22:00:00` } } };
    p.interval_segments = [segment]; if (only) p.segments = []; return p;
  };
  const intervals = setup((url) => json(intervalPage(url)));
  const partial = await intervals.service.search(request, context()); assert.ok('response' in partial);
  assert.ok(partial.response.metadata!.coverage.reasons.includes('interval_services_unsupported')); checks++;
  code(await setup((url) => json(intervalPage(url, true))).service.search(request, context()), 'unsupported_request'); checks++;

  for (const [status, expected] of [[400, 'unsupported_request'], [401, 'provider_unauthorized'], [403, 'provider_unauthorized'], [404, 'unsupported_request'], [429, 'provider_rate_limited'], [500, 'provider_unavailable'], [503, 'provider_unavailable'], [418, 'provider_unavailable'], [201, 'provider_unavailable'], [302, 'provider_unavailable']] as const) {
    const h = setup(() => json({ error: { secret: KEY } }, status)); code(await h.service.search(request, context()), expected); assert.equal(h.calls.length, 1); checks++;
  }
  for (const response of [new Response('{bad', { headers: { 'content-type': 'application/json' } }), new Response('{}', { headers: { 'content-type': 'text/html' } }), json('a'.repeat(256_001)), json({})]) {
    code(await setup(() => response).service.search(request, context()), 'malformed_provider_response'); checks++;
  }
  const mutants: Array<(p: ReturnType<typeof page>) => void> = [
    (p) => { delete (p as Partial<typeof p>).search; },
    (p) => { p.segments[0]!.departure = '2026-02-30T18:00:00+03:00'; },
    (p) => { p.segments[0]!.arrival = `${request.departureDate}T22:00:00`; },
    (p) => { p.segments[0]!.thread.transport_type = 'unknown'; },
    (p) => { p.segments[0]!.from.code = 's999'; },
    (p) => { p.segments[0]!.duration = 1; },
    (p) => { p.segments[0]!.tickets_info.places[0]!.currency = 'ZZZ'; },
    (p) => { p.segments[0]!.thread.carrier.title = 'x'.repeat(161); },
    (p) => { p.segments[0]!.thread.carrier.title = KEY; },
    (p) => { p.pagination.offset = 20; },
    (p) => { p.search.from.code = 'c999'; },
    (p) => { Object.defineProperty(p, '__proto__', { value: { injected: true }, enumerable: true }); },
  ];
  for (const mutate of mutants) {
    code(await setup((url) => { const p = page(url); mutate(p); return json(p); }).service.search(request, context()), 'malformed_provider_response'); checks++;
  }
  code(await setup((url) => { const p = page(url); p.segments[0]!.has_transfers = true; return json(p); }).service.search(request, context()), 'unsupported_request'); checks++;
  const nulls = setup((url) => { const p = page(url); return json({ ...p, segments: [{ ...p.segments[0], tickets_info: null, thread: { ...p.segments[0]!.thread, carrier: null } }] }); });
  const nullable = await nulls.service.search(request, context()); assert.ok('response' in nullable);
  assert.equal(nullable.response.routes[0]!.price, undefined); assert.equal(nullable.response.routes[0]!.segments[0]!.carrierName, undefined); checks++;
  const currency = await setup().service.search({ ...request, preferredCurrency: 'EUR', passengers: { adults: 3 } }, context());
  assert.ok('response' in currency); assert.equal(currency.response.routes[0]!.price!.currency, 'RUB'); assert.equal(currency.response.routes[0]!.price!.amountMinor, 1234550); checks++;
  const unresolved = setup(); code(await unresolved.service.search({ ...request, origin: { rawLabel: 'Unknown', type: 'city', resolution: 'unresolved' } }, context()), 'unresolved_location');
  assert.equal(unresolved.calls.length, 0); checks++;
  const missing = setup(); const { origin: _origin, ...incomplete } = request; code(await missing.service.search(incomplete, context()), 'missing_required_parameter'); assert.equal(missing.calls.length, 0); checks++;
  assert.throws(() => mapYandexSearchRequest(request, new Map([['arvelis:synthetic-origin', { searchCode: 'c213&apikey=bad', stationCodes: ['s213'] }]]), NOW)); checks++;
  const limited = setup(undefined, { YANDEX_RASP_REQUESTS_PER_MINUTE: '1' }); await limited.service.search(request, context());
  code(await limited.service.search(request, context()), 'provider_rate_limited'); assert.equal(limited.calls.length, 1); checks++;
  let timeoutSignal: AbortSignal | undefined;
  const stalled = setup((_url, init) => { timeoutSignal = init.signal as AbortSignal; return new Promise(() => {}); }, { YANDEX_RASP_TIMEOUT_MS: '15' });
  code(await stalled.service.search(request, context()), 'provider_timeout'); assert.equal(timeoutSignal!.aborted, true); assert.equal(stalled.calls.length, 1); checks++;
  const cancellation = new AbortController(); const aborting = setup((_url, init) => {
    setTimeout(() => cancellation.abort(), 5); return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error(KEY)), { once: true }));
  });
  code(await aborting.service.search(request, context(cancellation.signal)), 'aborted'); assert.equal(aborting.calls.length, 1); checks++;
  const cancelled = new AbortController(); cancelled.abort(); const pre = setup(); code(await pre.service.search(request, context(cancelled.signal)), 'aborted'); assert.equal(pre.calls.length, 0); checks++;
  const redirected = setup((url) => { const r = json(page(url)); Object.defineProperty(r, 'url', { value: 'https://evil.invalid/search' }); return r; });
  code(await redirected.service.search(request, context()), 'malformed_provider_response'); checks++;
  for (const baseUrl of ['https://api.rasp.yandex.net/v3.0/', 'https://api.rasp.yandex-net.ru:444/v3.0/', 'https://api.rasp.yandex-net.ru/v3.0/?apikey=bad', 'https://name:pass@api.rasp.yandex-net.ru/v3.0/', 'https://evil.invalid/v3.0/']) {
    assert.throws(() => new YandexRaspHttpClient({ apiKey: KEY, baseUrl }), YandexRaspHttpError); checks++;
  }
  // Actual loopback fetch verifies redirect:error; target never receives credentials.
  let targetCalls = 0;
  const server = createServer((req, res) => { if (req.url!.startsWith('/target')) { targetCalls++; res.end('{}'); } else { res.writeHead(302, { location: '/target' }); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try {
    const client = new YandexRaspHttpClient({ apiKey: KEY, baseUrl: `http://127.0.0.1:${address.port}/v3.0/`, allowInsecureTestEndpoint: true });
    await assert.rejects(client.searchPage(mapYandexSearchRequest(request, bindings, NOW)[0]!, new AbortController().signal), YandexRaspHttpError);
    assert.equal(targetCalls, 0); checks++;
  } finally { server.close(); await once(server, 'close'); }

  let bodyCancelled = false;
  const stalledBody = setup(() => new Response(new ReadableStream({ cancel() { bodyCancelled = true; } }), { headers: { 'content-type': 'application/json' } }), { YANDEX_RASP_TIMEOUT_MS: '15' });
  code(await stalledBody.service.search(request, context()), 'provider_timeout');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(bodyCancelled, true); checks++;
  const betweenPages = new AbortController(); const cancelledPages = setup((url) => {
    betweenPages.abort(); return json(page(url, 10, 20));
  });
  code(await cancelledPages.service.search(request, context(betweenPages.signal)), 'aborted'); assert.equal(cancelledPages.calls.length, 1); checks++;
  const injectedParams = mapYandexSearchRequest(request, bindings, NOW)[0]!;
  injectedParams.params.append('apikey', 'fixture-injection');
  const parameterClient = new YandexRaspHttpClient({ apiKey: KEY, fetchImpl: async () => { assert.fail('injected parameters must never execute'); } });
  await assert.rejects(parameterClient.searchPage(injectedParams, new AbortController().signal), YandexRaspHttpError); checks++;
  let copyrightCalls = 0;
  const copyright = new YandexRaspHttpClient({ apiKey: KEY, fetchImpl: async (u, init) => {
    copyrightCalls++; assert.equal(new URL(String(u)).pathname, '/v3.0/copyright/'); assert.equal(String(u).includes(KEY), false);
    assert.equal(init?.redirect, 'error');
    return json({ copyright: { text: 'Данные предоставлены сервисом Яндекс Расписания', url: 'http://rasp.yandex.ru/',
      ...Object.fromEntries(['logo_vm', 'logo_vd', 'logo_vy', 'logo_hm', 'logo_hd', 'logo_hy'].map((key) => [key, '<iframe src="//yandex.st/fixture"></iframe>'])) } });
  } });
  const attribution = await copyright.getCopyright(new AbortController().signal);
  assert.equal(attribution.bannerMarkupPresent, true); assert.equal(JSON.stringify(attribution).includes('<iframe'), false); assert.equal(copyrightCalls, 1); checks++;
  const concurrentAbort = new AbortController();
  const concurrent = setup((_url, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('fixture abort')))));
  const firstPending = concurrent.service.search(request, context(concurrentAbort.signal));
  await new Promise<void>((resolve) => setImmediate(resolve));
  code(await concurrent.service.search(request, context()), 'provider_rate_limited');
  concurrentAbort.abort(); code(await firstPending, 'aborted'); assert.equal(concurrent.calls.length, 1); checks++;

  // Full normalized provider -> service -> registry -> Gateway -> Qwen HTTP serializer.
  let clock = NOW; const h = setup(undefined, {}, () => clock);
  const registry = new AiToolRegistry([registerTransportSearchTool(h.service)]);
  let modelCalls = 0; let expireDuringGeneration = false; let inventPrice = false;
  const runtime = new QwenLlamaCppRuntime({ baseUrl: 'http://127.0.0.1:8080/v1', fetchImpl: async (_url, init) => {
    modelCalls++; const body = String(init!.body); const payload = JSON.parse(body);
    const ctx = JSON.parse(payload.messages[1].content.split('\n')[1]);
    assert.equal(payload.tools, undefined); assert.equal(ctx.transportSearchRequest, undefined);
    assert.equal(body.includes('rawLabel'), false); assert.equal(body.includes(KEY), false);
    assert.ok(Buffer.byteLength(body) < 7_000, 'one provider-shaped schedule/price fixture remains bounded');
    const evidence = ctx.evidence.find((e: { domain: string }) => e.domain === (inventPrice ? 'price' : 'transport_schedule'));
    assert.ok(evidence.id.startsWith('tool:required-transport-search-v1:route-0-'));
    assert.ok(evidence.retrievedAt); assert.ok(evidence.sourceUrl); assert.ok(evidence.freshness);
    if (expireDuringGeneration) clock = new Date(NOW.getTime() + YANDEX_SCHEDULE_FRESHNESS.ttlMs + 1);
    const message = inventPrice ? 'Билет стоит 12345.50 RUB.' : 'Тестовое расписание: отправление в 18:00 +03:00.';
    return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ version: 1, requestId: 'fixture-projection', message,
      claims: [{ id: 'fixture-claim', mode: 'fact', domain: inventPrice ? 'price' : 'transport_schedule', statement: message, evidenceIds: [evidence.id] }] }) } }] });
  } });
  const gateway = new AiGateway({ runtime: { id: runtime.id, async generate(input, signal) {
    assert.equal(input.evidence[0]!.provenance!.requestId, 'fixture-projection');
    assert.ok(input.evidence[0]!.expiresAt);
    return runtime.generate(input, signal);
  } }, tools: registry, now: () => clock, requestId: () => 'fixture-projection' });
  const aiRequest = { version: 1 as const, scope: 'trip' as const, locale: 'ru-RU' as const, prompt: 'Проверь актуальное расписание поезда.' };
  const aiContext = { accountScopeId: 'fixture-account', authorizedTripId: 'fixture-trip', transportSearchRequest: request };
  const answer = await gateway.run(aiRequest, aiContext); assert.equal(answer.audit.toolCallsExecuted, 1); assert.equal(modelCalls, 1); assert.equal(h.calls.length, 1); checks++;
  expireDuringGeneration = true;
  await assert.rejects(gateway.run(aiRequest, aiContext), (e: unknown) => e instanceof AiGatewayError && e.code === 'invalid_model_output'); checks++;
  clock = NOW; expireDuringGeneration = false; inventPrice = true;
  await assert.rejects(gateway.run(aiRequest, aiContext), (e: unknown) => e instanceof AiGatewayError && e.code === 'invalid_model_output'); checks++;
  assert.equal(modelCalls, 3); assert.equal(h.calls.length, 3, 'no retries or hidden calls');
  console.log(`Yandex normalized read-only provider: PASS (${checks} deterministic fixture/security/integration checks; no external API)`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
