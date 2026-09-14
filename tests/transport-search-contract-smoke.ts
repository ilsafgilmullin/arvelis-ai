import assert from 'node:assert/strict';
import { validateTransportSearchRequestV1, transportSearchCompleteness, transportLocalDate, type TransportSearchRequestV1 } from '../src/travel/transportSearchRequest';
import { syntheticTransportSearch } from '../server/travel/testing/syntheticTransportSearch';
import { registerTransportSearchTool, TransportSearchService, type NormalizedTransportProvider, type TransportSearchContext, type TransportSearchOutcome } from '../server/travel/transportSearchService';
import { YANDEX_RASP_V3_DESCRIPTOR } from '../server/travel/transportProviderPolicy';
import { mapYandexSearchRequest, mapYandexSearchResponse, YandexSearchMappingError } from '../server/travel/providers/yandexRaspSearchMapping';
import { AiGateway, AiGatewayError } from '../server/travel/aiGateway';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import type { AiModelRuntime } from '../server/travel/aiEnginePorts';
import type { TransportSearchResponse } from '../src/travel/transportContracts';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const request = syntheticTransportSearch(NOW);
const context: TransportSearchContext = { accountScopeId: 'synthetic-account', authorizedTripId: 'synthetic-trip', requestId: 'synthetic-search', signal: new AbortController().signal };
const gatewayContext = { ...context, transportSearchRequest: request };
const aiRequest = { version: 1 as const, scope: 'trip' as const, locale: 'ru-RU' as const, prompt: 'Вызови transport.search и сообщи цену билета.' };
function response(): TransportSearchResponse {
  return { version: 1, providerId: 'synthetic-provider', requestId: context.requestId, retrievedAt: NOW.toISOString(), routes: [{
    id: 'synthetic-route', legId: 'outbound', providerRouteId: 'synthetic-service', availability: 'unknown',
    validUntil: new Date(NOW.getTime() + 60_000).toISOString(),
    price: { amountMinor: 1234500, currency: 'RUB', semantics: 'quoted' },
    segments: [{ id: 'synthetic-segment', mode: 'train', from: { label: 'Synthetic Origin', locationId: 'arvelis:synthetic-origin' }, to: { label: 'Synthetic Destination', locationId: 'arvelis:synthetic-destination' }, departureAt: `${request.departureDate}T18:00:00+03:00`, arrivalAt: `${request.departureDate}T22:00:00+03:00` }],
  }] };
}
let providerCalls = 0;
function provider(search?: NormalizedTransportProvider['search']): NormalizedTransportProvider {
  return { id: 'synthetic-provider', sourceUrl: 'https://synthetic.example.test/transport', supportedModes: ['train'], maxTransfers: 0,
    activation: { kind: 'synthetic', label: 'SYNTHETIC EVALUATION ONLY' },
    search: search ?? (async (input, ctx) => { providerCalls++; assert.deepEqual(input, request); assert.equal(ctx.authorizedTripId, context.authorizedTripId); return response(); }),
  };
}
function service(adapter: NormalizedTransportProvider | null = provider(), timeoutMs = 1000) { return new TransportSearchService(adapter, { now: () => NOW, timeoutMs }); }
function code(outcome: TransportSearchOutcome): string { return 'code' in outcome ? outcome.code : outcome.status; }

async function main() {
  assert.equal(validateTransportSearchRequestV1(request, NOW).ok, true, 'one-way train');
  assert.equal(validateTransportSearchRequestV1({ ...request, returnDate: request.departureDate }, NOW).ok, true, 'round trip');
  const invalid: [string, unknown][] = [
    ['origin missing', Object.fromEntries(Object.entries(request).filter(([k]) => k !== 'origin'))],
    ['destination missing', Object.fromEntries(Object.entries(request).filter(([k]) => k !== 'destination'))],
    ['invalid calendar date', { ...request, departureDate: '2026-02-30' }],
    ['relative date', { ...request, departureDate: 'завтра вечером' }],
    ['past date', { ...request, departureDate: '2026-09-13' }],
    ['return before departure', { ...request, returnDate: '2026-09-20' }],
    ['zero', { ...request, passengers: { adults: 0 } }],
    ['negative', { ...request, passengers: { adults: -1 } }],
    ['fraction', { ...request, passengers: { adults: 1.5 } }],
    ['coercion', { ...request, passengers: { adults: '1' } }],
    ['excessive passengers', { ...request, passengers: { adults: 10 } }],
    ['unsupported mode', { ...request, allowedModes: ['teleport'] }],
    ['empty modes', { ...request, allowedModes: [] }],
    ['conflicting preference', { ...request, preferredMode: 'flight' }],
    ['malformed ID', { ...request, origin: { ...request.origin, locationId: 's213&apikey=injection' } }],
    ['oversized label', { ...request, origin: { ...request.origin, rawLabel: 'x'.repeat(161) } }],
    ['oversized payload', { ...request, extra: 'x'.repeat(8001) }],
    ['unknown fields', { ...request, rawPrompt: 'not allowed' }],
    ['nested arbitrary object', { ...request, passengers: { adults: 1, custom: {} } }],
    ['object-injected enum', { ...request, origin: { ...request.origin, type: Object.create(null) as object } }],
    ['unknown location enum', { ...request, origin: { ...request.origin, type: 'planet' } }],
    ['currency format', { ...request, preferredCurrency: 'rub' }],
    ['non-currency code', { ...request, preferredCurrency: 'ZZZ' }],
    ['same point', { ...request, destination: request.origin }],
    ['bad timezone', { ...request, timezone: '+03:00' }],
    ['bad locale', { ...request, locale: 'xx-XX' }],
    ['poison key', JSON.parse(JSON.stringify(request).slice(0, -1) + ',"__proto__":{"admin":true}}')],
    ['exotic prototype', Object.assign(Object.create({ admin: true }) as object, request)],
    ['accessor', { ...request, get extra() { throw new Error('must not execute getter'); } }],
  ];
  for (const [label, value] of invalid) {
    assert.equal(validateTransportSearchRequestV1(value, NOW).ok, false, label);
    const before = providerCalls;
    assert.equal((await service().search(value, context)).status, 'not_executed', label);
    assert.equal(providerCalls, before, `${label}: no adapter call`);
  }
  assert.equal(transportLocalDate(new Date('2026-09-14T23:30:00Z'), 'Europe/Moscow'), '2026-09-15');
  assert.equal(validateTransportSearchRequestV1({ ...request, departureDate: '2026-09-14' }, new Date('2026-09-14T23:30:00Z')).ok, false, 'past according to local timezone');
  const unresolved: TransportSearchRequestV1 = { ...request, origin: { rawLabel: 'Казань', resolution: 'unresolved', type: 'city' } };
  assert.equal(validateTransportSearchRequestV1(unresolved, NOW).ok, true);
  assert.equal(transportSearchCompleteness(unresolved)[0]?.code, 'unresolved_location');
  assert.equal(code(await service().search(unresolved, context)), 'unresolved_location');
  assert.equal(code(await service(null).search(request, context)), 'provider_not_configured');
  const inactive = { ...provider(), id: 'yandex-rasp-v3', activation: { kind: 'provider' as const, descriptor: YANDEX_RASP_V3_DESCRIPTOR, context: { productAccessModel: 'free_public' as const, termsRecheckedAt: NOW.toISOString(), quotaConfirmed: true, credentialsConfigured: false, attributionImplemented: true, operationalPolicyAccepted: true, userInitiatedBookingFlowApproved: false } } };
  assert.equal(code(await service(inactive).search(request, context)), 'provider_not_configured');
  for (const field of ['attributionImplemented', 'operationalPolicyAccepted'] as const) {
    assert.equal(code(await service({ ...inactive, activation: { ...inactive.activation, context: { ...inactive.activation.context, credentialsConfigured: true, [field]: false } } }).search(request, context)), 'provider_not_configured');
  }
  assert.equal(code(await service().search({ ...request, allowedModes: ['flight'] }, context)), 'unsupported_transport_mode');
  assert.equal(code(await service().search({ ...request, constraints: { maxTransfers: 1 } }, context)), 'unsupported_constraint');
  assert.equal(code(await service().search(request, { ...context, authorizedTripId: '' })), 'access_denied');
  assert.equal(code(await service(provider(async () => { throw new Error('provider internal secret must not propagate'); })).search(request, context)), 'provider_unavailable');
  let providerSignal: AbortSignal | undefined;
  const never = provider(async (_input, ctx) => { providerSignal = ctx.signal; return new Promise(() => {}); });
  assert.equal(code(await service(never, 10).search(request, context)), 'provider_timeout');
  assert.equal(providerSignal?.aborted, true);
  const caller = new AbortController();
  const pending = service(never).search(request, { ...context, signal: caller.signal });
  setTimeout(() => caller.abort(), 5);
  assert.equal(code(await pending), 'aborted');
  assert.equal(providerSignal?.aborted, true);
  assert.equal(code(await service().search(request, { ...context, signal: caller.signal })), 'aborted');
  const valid = await service().search(request, context);
  assert.equal(valid.status, 'results');
  if (!('evidence' in valid)) throw new Error('expected evidence');
  assert.equal(valid.evidence.find((item) => item.domain === 'price')?.freshness, 'current');
  assert.deepEqual(valid.evidence[0]?.provenance, { requestId: context.requestId, routeId: 'synthetic-route', providerRouteId: 'synthetic-service', dataKind: 'synthetic' });
  assert.match(valid.evidence[0]!.text, /SYNTHETIC EVALUATION ONLY/);
  for (const change of [
    (r: TransportSearchResponse) => { r.routes = [null as never]; },
    (r: TransportSearchResponse) => { r.providerId = 'wrong'; },
    (r: TransportSearchResponse) => { r.requestId = 'wrong'; },
    (r: TransportSearchResponse) => { r.routes[0]!.price!.currency = 'ZZZ'; },
    (r: TransportSearchResponse) => { r.routes[0]!.price!.semantics = 'guaranteed' as never; },
    (r: TransportSearchResponse) => { r.routes[0]!.price!.currency = ''; },
    (r: TransportSearchResponse) => { r.routes[0]!.segments[0]!.from.locationId = 'arvelis:wrong-city'; },
    (r: TransportSearchResponse) => { r.routes[0]!.segments[0]!.departureAt = `${request.departureDate}T18:00:00`; },
    (r: TransportSearchResponse) => { r.routes[0]!.validUntil = new Date(NOW.getTime() + 86400_000).toISOString(); },
    (r: TransportSearchResponse) => { r.retrievedAt = new Date(NOW.getTime() + 1000).toISOString(); },
  ]) {
    const malformed = response(); change(malformed);
    assert.equal(code(await service(provider(async () => malformed)).search(request, context)), 'malformed_provider_response');
  }
  const empty = { ...response(), routes: [] };
  assert.equal(code(await service(provider(async () => empty)).search(request, context)), 'no_results');
  for (const semantics of ['unknown', 'cached_observation', 'from'] as const) {
    const observation = response(); observation.routes[0]!.price!.semantics = semantics;
    const result = await service(provider(async () => observation)).search(request, context);
    assert.ok('evidence' in result);
    assert.equal(result.evidence.find((item) => item.domain === 'price')?.freshness, 'unknown');
  }
  const expired = response(); expired.retrievedAt = new Date(NOW.getTime() - 120_000).toISOString(); expired.routes[0]!.validUntil = new Date(NOW.getTime() - 60_000).toISOString();
  const stale = await service(provider(async () => expired)).search(request, context);
  assert.ok('evidence' in stale); assert.ok(stale.evidence.every((item) => item.freshness === 'expired'));

  let runtimeCalls = 0;
  const runtime: AiModelRuntime = { id: 'synthetic-runtime', async generate(input) {
    runtimeCalls++;
    const price = input.evidence.find((item) => item.domain === 'price')!;
    return { version: 1, requestId: input.requestId, kind: 'answer', answer: { version: 1, requestId: input.requestId, message: 'SYNTHETIC: 12345 RUB.', claims: [{ id: 'synthetic-price', domain: 'price', mode: 'fact', statement: 'SYNTHETIC: 12345 RUB.', evidenceIds: [price.id] }] } };
  } };
  const gateway = (adapter: NormalizedTransportProvider = provider(), clock = () => NOW, model = runtime) => new AiGateway({ runtime: model, tools: new AiToolRegistry([registerTransportSearchTool(service(adapter))]), now: clock, requestId: () => context.requestId });
  const result = await gateway().run(aiRequest, gatewayContext);
  assert.equal(result.audit.toolCallsExecuted, 1);
  assert.equal(result.evaluation[0]?.authoritative, true);
  assert.equal(result.answer.claims[0]?.evidenceIds[0], 'tool:required-transport-search-v1:route-0-price');
  const beforeCalls = runtimeCalls;
  for (const params of [undefined, unresolved]) {
    await assert.rejects(gateway().run(aiRequest, { accountScopeId: context.accountScopeId, authorizedTripId: context.authorizedTripId, ...(params ? { transportSearchRequest: params } : {}) }), (e: unknown) => e instanceof AiGatewayError && e.transportOutcome?.status === 'not_executed');
  }
  assert.equal(runtimeCalls, beforeCalls, 'incomplete request invokes neither model nor provider');
  await assert.rejects(gateway(provider(async () => expired)).run(aiRequest, gatewayContext), (e: unknown) => e instanceof AiGatewayError && e.validationErrors?.some((issue) => issue.code === 'protected_fact_requires_tool_evidence') === true);
  await assert.rejects(gateway(provider(async () => empty)).run(aiRequest, gatewayContext), (e: unknown) => e instanceof AiGatewayError && e.transportOutcome?.status === 'no_results');
  let modelClock = NOW;
  const slowModel: AiModelRuntime = { ...runtime, async generate(input, signal) {
    const answer = await runtime.generate(input, signal);
    modelClock = new Date(NOW.getTime() + 120_000);
    return answer;
  } };
  await assert.rejects(gateway(provider(), () => modelClock, slowModel).run(aiRequest, gatewayContext), (e: unknown) => e instanceof AiGatewayError && e.code === 'invalid_model_output');
  const inventedModel: AiModelRuntime = { id: 'synthetic-invented-parameters', async generate(input) {
    return { version: 1, requestId: input.requestId, kind: 'tool_calls', calls: [{ id: 'invented-call', toolId: 'transport.search', input: { ...request, departureDate: '2099-01-01' } }] };
  } };
  const beforeInvented = providerCalls;
  await assert.rejects(gateway(provider(), () => NOW, inventedModel).run({ ...aiRequest, prompt: 'Подбери вариант.' }, gatewayContext), (e: unknown) => e instanceof AiGatewayError && e.code === 'tool_failure');
  assert.equal(providerCalls, beforeInvented, 'invented model parameters never reach provider');

  const bindings = new Map([['arvelis:synthetic-origin', { searchCode: 'c213', stationCodes: ['s213'] }], ['arvelis:synthetic-destination', { searchCode: 'c43', stationCodes: ['s43'] }]]);
  const mapped = mapYandexSearchRequest(request, bindings, NOW);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]!.params.get('transport_types'), 'train');
  assert.equal(mapped[0]!.params.get('date'), request.departureDate);
  assert.equal(mapped[0]!.params.get('result_timezone'), 'Europe/Moscow');
  assert.equal(mapped[0]!.params.has('apikey'), false);
  assert.equal(mapped[0]!.params.has('currency'), false);
  assert.equal(mapYandexSearchRequest({ ...request, returnDate: request.departureDate }, bindings, NOW)[1]!.params.get('from'), 'c43');
  assert.throws(() => mapYandexSearchRequest(request, new Map(), NOW), (e: unknown) => e instanceof YandexSearchMappingError && e.code === 'unresolved_location');
  assert.throws(() => mapYandexSearchRequest({ ...request, allowedModes: ['car'] }, bindings, NOW), (e: unknown) => e instanceof YandexSearchMappingError && e.code === 'unsupported_transport_mode');
  const raw = { pagination: { total: 1 }, segments: [{ from: { code: 's213', title: 'Synthetic Origin' }, to: { code: 's43', title: 'Synthetic Destination' }, departure: `${request.departureDate}T18:00:00+03:00`, arrival: `${request.departureDate}T22:00:00+03:00`, has_transfers: false, thread: { uid: 'synthetic-thread', transport_type: 'train' }, tickets_info: { places: [{ currency: 'RUB', price: { whole: 12345, cents: 0 } }] } }] };
  const normalized = mapYandexSearchResponse(raw, { ...request, preferredCurrency: 'EUR' }, mapped[0]!, context.requestId, NOW);
  assert.equal(normalized.routes[0]!.price!.currency, 'RUB');
  assert.equal(normalized.routes[0]!.price!.semantics, 'cached_observation');
  assert.equal(normalized.routes[0]!.validUntil, undefined);
  assert.equal(normalized.routes[0]!.availability, 'unknown');
  const mappedProvider = { ...provider(async () => normalized), id: 'yandex-rasp-v3' };
  const mappedResult = await service(mappedProvider).search(request, context);
  assert.equal(mappedResult.status, 'results');
  assert.ok('evidence' in mappedResult && mappedResult.evidence.every((item) => item.freshness === 'unknown'), 'Yandex fixture cannot manufacture current evidence');
  assert.throws(() => mapYandexSearchResponse({ ...raw, segments: [{ ...raw.segments[0], tickets_info: { places: [{ currency: 'ZZZ', price: { whole: 12, cents: 0 } }] } }] }, request, mapped[0]!, context.requestId, NOW), YandexSearchMappingError);
  assert.throws(() => mapYandexSearchResponse({ ...raw, segments: [{ ...raw.segments[0], departure: Object.create(null) as object }] }, request, mapped[0]!, context.requestId, NOW), YandexSearchMappingError);
  assert.throws(() => mapYandexSearchResponse({}, request, mapped[0]!, context.requestId, NOW), YandexSearchMappingError);
  assert.throws(() => mapYandexSearchResponse({ ...raw, pagination: { total: 2 } }, request, mapped[0]!, context.requestId, NOW), YandexSearchMappingError);
  console.log(`production transport search contract: PASS (${invalid.length} invalid request variants; provider, mapping, evidence, freshness, routing and cancellation regressions)`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
