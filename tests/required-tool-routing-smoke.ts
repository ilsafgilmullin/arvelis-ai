import assert from 'node:assert/strict';
import {
  AiGateway,
  AiGatewayError,
  REQUIRED_TRANSPORT_TOOL_CALL_ID,
  REQUIRED_TRANSPORT_TOOL_ROUTING_VERSION,
} from '../server/travel/aiGateway';
import type { AiModelRuntime } from '../server/travel/aiEnginePorts';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import type { AiGatewayRequest } from '../src/travel/aiKnowledgeContracts';

const context = {
  accountScopeId: 'acct-required-routing',
  authorizedTripId: 'trip-required-routing',
};

function request(prompt: string): AiGatewayRequest {
  return {
    version: 1,
    prompt,
    locale: 'ru-RU',
    scope: 'trip',
  };
}

function transportRegistry(onCall?: () => void, freshness: 'current' | 'expired' = 'current'): AiToolRegistry {
  return new AiToolRegistry([{
    id: 'transport.search',
    async handler(input, toolContext) {
      onCall?.();
      assert.deepEqual(input, { intent: 'required-live-transport' });
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
          retrievedAt: freshness === 'current' ? '2026-09-13T00:00:00.000Z' : '2025-01-01T00:00:00.000Z',
        }],
      };
    },
  }]);
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
    now: () => new Date('2026-09-13T12:00:00.000Z'),
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

  let generalToolCalls = 0;
  const generalRuntime: AiModelRuntime = {
    id: 'required-routing-general-runtime',
    async generate(input) {
      assert.equal(input.evidence.length, 0, 'general advice must not trigger transport.search');
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

  let staleToolCalls = 0;
  const staleRuntime: AiModelRuntime = {
    id: 'required-routing-stale-runtime',
    async generate(input) {
      assert.equal(input.evidence[0]?.freshness, 'expired');
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
