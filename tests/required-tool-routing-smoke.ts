import { syntheticTransportSearch } from '../server/travel/testing/syntheticTransportSearch';
import assert from 'node:assert/strict';
import {
  AiGateway,
  AiGatewayError,
  REQUIRED_TRANSPORT_TOOL_CALL_ID,
  REQUIRED_TRANSPORT_TOOL_ROUTING_VERSION,
} from '../server/travel/aiGateway';
import type { AiModelRuntime, AiToolRegistration } from '../server/travel/aiEnginePorts';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import { AI_TOOL_CATALOG, type AiGatewayRequest } from '../src/travel/aiKnowledgeContracts';

const fixtureNow = new Date();
const searchFixture = syntheticTransportSearch(fixtureNow);

const context = {
  accountScopeId: 'acct-required-routing',
  authorizedTripId: 'trip-required-routing',
  transportSearchRequest: searchFixture,
};

function request(prompt: string): AiGatewayRequest {
  return {
    version: 1,
    prompt,
    locale: 'ru-RU',
    scope: 'trip',
  };
}

function transportRegistry(onCall?: () => void, freshness: 'current' | 'expired' = 'current', extra: AiToolRegistration[] = []): AiToolRegistry {
  return new AiToolRegistry([{
    id: 'transport.search',
    async handler(input, toolContext) {
      onCall?.();
      assert.deepEqual(input, searchFixture);
      assert.equal(toolContext.accountScopeId, context.accountScopeId);
      assert.equal(toolContext.authorizedTripId, context.authorizedTripId);
      return {
        evidence: [{
          id: 'required-price',
          domain: 'price',
          text: freshness === 'current'
            ? 'SYNTHETIC: provider-confirmed price is 12345 RUB.'
            : 'SYNTHETIC: expired provider-confirmed price was 12345 RUB.',
          freshness,
          sourceType: 'provider',
          providerId: 'synthetic-required-routing',
          sourceUrl: 'https://synthetic.example.test/transport/required-price',
          retrievedAt: new Date(fixtureNow.getTime() - 60_000).toISOString(),
          expiresAt: new Date(fixtureNow.getTime() + (freshness === 'current' ? 300_000 : -1)).toISOString(),
          provenance: { requestId: toolContext.requestId, routeId: 'synthetic-route', providerRouteId: 'synthetic-service', dataKind: 'synthetic' },
        }],
      };
    },
  }, ...extra]);
}

async function main(): Promise<void> {
  assert.equal(REQUIRED_TRANSPORT_TOOL_ROUTING_VERSION, 1);

  let explicitToolCalls = 0;
  let explicitRuntimeCalls = 0;
  const explicitRuntime: AiModelRuntime = {
    id: 'required-routing-explicit-runtime',
    async generate(input) {
      explicitRuntimeCalls += 1;
      assert.equal(input.evidence.length, 1, 'required tool evidence must exist before the model runs');
      assert.equal(input.evidence[0]?.toolId, 'transport.search');
      assert.equal(input.evidence[0]?.id, `tool:${REQUIRED_TRANSPORT_TOOL_CALL_ID}:required-price`);
      assert.deepEqual(input.tools, [], 'completed transport search is no longer advertised');
      assert.equal(Object.hasOwn(input, 'transportSearchRequest'), false, 'executed request stays server-side');
      assert.deepEqual(input.evidence[0], {
        id: `tool:${REQUIRED_TRANSPORT_TOOL_CALL_ID}:required-price`, origin: 'tool', toolId: 'transport.search',
        domain: 'price', text: 'SYNTHETIC: provider-confirmed price is 12345 RUB.', freshness: 'current',
        sourceType: 'provider', providerId: 'synthetic-required-routing',
        sourceUrl: 'https://synthetic.example.test/transport/required-price',
        retrievedAt: new Date(fixtureNow.getTime() - 60_000).toISOString(),
        expiresAt: new Date(fixtureNow.getTime() + 300_000).toISOString(),
        provenance: { requestId: input.requestId, routeId: 'synthetic-route', providerRouteId: 'synthetic-service', dataKind: 'synthetic' },
      }, 'the projection preserves the entire registry-normalized evidence');
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Подтверждённая цена — 12 345 ₽.',
          claims: [{
            id: 'required-price-claim',
            domain: 'price',
            statement: 'Подтверждённая цена — 12 345 ₽.',
            mode: 'fact',
            evidenceIds: [`tool:${REQUIRED_TRANSPORT_TOOL_CALL_ID}:required-price`],
          }],
        },
      };
    },
  };

  const explicitResult = await new AiGateway({
    runtime: explicitRuntime,
    tools: transportRegistry(() => { explicitToolCalls += 1; }),
    requestId: () => 'required-routing-explicit',
    now: () => fixtureNow,
  }).run(
    request('Для ответа сначала обязательно вызови transport.search и сообщи подтверждённую цену билета.'),
    context,
  );

  assert.equal(explicitToolCalls, 1);
  assert.equal(explicitRuntimeCalls, 1);
  assert.equal(explicitResult.audit.toolCallsExecuted, 1);
  assert.equal(explicitResult.evaluation[0]?.authoritative, true);
  assert.equal(explicitResult.evaluation[0]?.reason, 'tool_evidence');

  let naturalToolCalls = 0;
  const naturalRuntime: AiModelRuntime = {
    id: 'required-routing-natural-runtime',
    async generate(input) {
      assert.equal(input.evidence.some((item) => item.toolId === 'transport.search'), true);
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Цена подтверждена источником транспорта.',
          claims: [{
            id: 'natural-price-claim',
            domain: 'price',
            statement: 'Цена подтверждена источником транспорта.',
            mode: 'fact',
            evidenceIds: [`tool:${REQUIRED_TRANSPORT_TOOL_CALL_ID}:required-price`],
          }],
        },
      };
    },
  };

  const naturalResult = await new AiGateway({
    runtime: naturalRuntime,
    tools: transportRegistry(() => { naturalToolCalls += 1; }),
    requestId: () => 'required-routing-natural',
  }).run(request('Покажи актуальную цену билета на поезд Москва — Казань.'), context);

  assert.equal(naturalToolCalls, 1, 'live transport fact intent must be routed server-side');
  assert.equal(naturalResult.audit.toolCallsExecuted, 1);
  await new AiGateway({ runtime: naturalRuntime, tools: transportRegistry(() => { naturalToolCalls += 1; }), requestId: () => 'required-routing-how-much' })
    .run(request('Сколько стоит поезд Москва — Казань на 20 сентября?'), context);
  assert.equal(naturalToolCalls, 2, 'natural how-much phrasing also requires deterministic search');

  let generalToolCalls = 0;
  const generalRuntime: AiModelRuntime = {
    id: 'required-routing-general-runtime',
    async generate(input) {
      assert.equal(input.evidence.length, 0, 'general advice must not trigger transport.search');
      assert.deepEqual(input.tools.map((tool) => tool.id), ['transport.search']);
      assert.deepEqual(input.transportSearchRequest, searchFixture, 'unexecuted connected transport keeps its approved input');
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Составьте список вещей и проверьте документы.',
          claims: [{
            id: 'general-inference',
            domain: 'general',
            statement: 'Это общая рекомендация.',
            mode: 'inference',
            evidenceIds: [],
          }],
        },
      };
    },
  };

  const generalResult = await new AiGateway({
    runtime: generalRuntime,
    tools: transportRegistry(() => { generalToolCalls += 1; }),
    requestId: () => 'required-routing-general',
  }).run(request('Дай общий чек-лист подготовки к поездке без внешних фактов.'), context);

  assert.equal(generalToolCalls, 0);
  assert.equal(generalResult.audit.toolCallsExecuted, 0);

  // Other connected tools remain usable after transport completes, across turns.
  let otherToolCalls = 0;
  let mixedTransportCalls = 0;
  let mixedRuntimeCalls = 0;
  const mixedRegistry = transportRegistry(() => { mixedTransportCalls += 1; }, 'current',
    (['trip.read', 'map.route', 'legal.check'] as const).map((id) => ({
      id, async handler() { otherToolCalls += 1; return { evidence: [] }; },
    })));
  const mixedRuntime: AiModelRuntime = {
    id: 'required-routing-other-tools',
    async generate(input, signal) {
      mixedRuntimeCalls += 1;
      assert.deepEqual(input.tools.map((tool) => tool.id), ['trip.read', 'map.route', 'legal.check']);
      assert.equal(Object.hasOwn(input, 'transportSearchRequest'), false);
      if (mixedRuntimeCalls === 1) return {
        version: 1, requestId: input.requestId, kind: 'tool_calls',
        calls: input.tools.map((tool, index) => ({ id: `other-${index}`, toolId: tool.id, input: {} })),
      };
      return explicitRuntime.generate({ ...input, tools: [] }, signal);
    },
  };
  const mixedResult = await new AiGateway({ runtime: mixedRuntime, tools: mixedRegistry, now: () => fixtureNow })
    .run(request('Сначала вызови transport.search и сообщи цену.'), context);
  assert.equal(mixedTransportCalls, 1);
  assert.equal(otherToolCalls, 3);
  assert.equal(mixedRuntimeCalls, 2, 'only the explicitly requested other-tool round adds a generation');
  assert.equal(mixedResult.audit.toolCallsExecuted, 4);

  // A custom runtime cannot restore a hidden tool by mutating its input allowlist.
  for (const mutateRuntimeTools of [false, true]) {
    let repeatedTransportCalls = 0;
    let repeatRuntimeCalls = 0;
    const repeatRuntime: AiModelRuntime = { id: 'required-routing-repeat', async generate(input) {
      repeatRuntimeCalls += 1;
      assert.equal(input.tools.length, 0);
      if (mutateRuntimeTools) input.tools.push(structuredClone(AI_TOOL_CATALOG.find((tool) => tool.id === 'transport.search')!));
      return { version: 1, requestId: input.requestId, kind: 'tool_calls', calls: [{ id: 'repeat-transport', toolId: 'transport.search', input: searchFixture }] };
    } };
    await assert.rejects(new AiGateway({ runtime: repeatRuntime, tools: transportRegistry(() => { repeatedTransportCalls += 1; }) })
      .run(request('Вызови transport.search и сообщи цену.'), context),
    (error: unknown) => error instanceof AiGatewayError && error.code === 'invalid_model_output');
    assert.equal(repeatedTransportCalls, 1, 'repeated transport call must not reach the registry handler');
    assert.equal(repeatRuntimeCalls, 1, 'rejected output does not trigger retry');
  }

  let unavailableRuntimeCalls = 0;
  await new AiGateway({ runtime: { id: 'required-routing-no-transport', async generate(input) {
    unavailableRuntimeCalls += 1;
    assert.deepEqual(input.tools, []);
    assert.equal(Object.hasOwn(input, 'transportSearchRequest'), false, 'unrelated turns do not serialize an unusable transport request');
    return { version: 1, requestId: input.requestId, kind: 'answer', answer: { version: 1, requestId: input.requestId, message: 'Общая рекомендация.', claims: [] } };
  } } }).run(request('Дай общий чек-лист.'), context);
  assert.equal(unavailableRuntimeCalls, 1);

  // An empty tool result must not be mistaken for supplied transport evidence.
  let emptyRuntimeCalls = 0;
  await new AiGateway({
    tools: new AiToolRegistry([{ id: 'transport.search', async handler(input) { assert.deepEqual(input, searchFixture); return { evidence: [] }; } }]),
    runtime: { id: 'required-routing-empty-evidence', async generate(input) {
      emptyRuntimeCalls += 1;
      assert.deepEqual(input.tools.map((tool) => tool.id), ['transport.search']);
      assert.deepEqual(input.transportSearchRequest, searchFixture);
      assert.deepEqual(input.evidence, []);
      return { version: 1, requestId: input.requestId, kind: 'answer', answer: { version: 1, requestId: input.requestId, message: 'Подтверждённых данных нет.', claims: [] } };
    } },
  }).run(request('Вызови transport.search и сообщи цену.'), context);
  assert.equal(emptyRuntimeCalls, 1);

  let staleToolCalls = 0;
  const staleRuntime: AiModelRuntime = {
    id: 'required-routing-stale-runtime',
    async generate(input) {
      assert.equal(input.evidence[0]?.freshness, 'expired');
      assert.deepEqual(input.tools, []);
      assert.equal(Object.hasOwn(input, 'transportSearchRequest'), false);
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Актуальную цену подтвердить нельзя: доступное evidence устарело.',
          claims: [],
        },
      };
    },
  };

  const staleResult = await new AiGateway({
    runtime: staleRuntime,
    tools: transportRegistry(() => { staleToolCalls += 1; }, 'expired'),
    requestId: () => 'required-routing-stale',
  }).run(request('Сначала вызови transport.search. Если цена устарела, не выдавай её как актуальную.'), context);

  assert.equal(staleToolCalls, 1);
  assert.equal(staleResult.answer.claims.length, 0);
  assert.equal(staleResult.audit.toolCallsExecuted, 1);

  let failedRuntimeCalls = 0;
  const failedRuntime: AiModelRuntime = {
    id: 'required-routing-failed-runtime',
    async generate(input) {
      failedRuntimeCalls += 1;
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: { version: 1, requestId: input.requestId, message: 'should not run', claims: [] },
      };
    },
  };
  const failedRegistry = new AiToolRegistry([{
    id: 'transport.search',
    async handler() {
      throw new Error('synthetic provider failure');
    },
  }]);

  await assert.rejects(
    new AiGateway({
      runtime: failedRuntime,
      tools: failedRegistry,
      requestId: () => 'required-routing-tool-failure',
    }).run(request('Найди актуальную цену билета на самолёт.'), context),
    (error: unknown) => error instanceof AiGatewayError && error.code === 'tool_failure',
  );
  assert.equal(failedRuntimeCalls, 0, 'model must not run after required tool failure');

  let timeoutRuntimeCalls = 0;
  const timeoutRuntime: AiModelRuntime = {
    id: 'required-routing-timeout-runtime',
    async generate(input) {
      timeoutRuntimeCalls += 1;
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: { version: 1, requestId: input.requestId, message: 'should not run', claims: [] },
      };
    },
  };
  const hangingRegistry = new AiToolRegistry([{
    id: 'transport.search',
    async handler(_input, _toolContext, signal) {
      return await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
      });
    },
  }]);

  await assert.rejects(
    new AiGateway({
      runtime: timeoutRuntime,
      tools: hangingRegistry,
      timeoutMs: 20,
      requestId: () => 'required-routing-timeout',
    }).run(request('Покажи актуальное расписание поездов.'), context),
    (error: unknown) => error instanceof AiGatewayError && error.code === 'timeout',
  );
  assert.equal(timeoutRuntimeCalls, 0, 'model must not run after required tool timeout');

  console.log('Required Tool Routing V1: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
