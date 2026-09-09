import assert from 'node:assert/strict';
import { AiGateway, AiGatewayError } from '../server/travel/aiGateway';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import type { AiRuntimeInput } from '../server/travel/aiEnginePorts';
import {
  QwenVllmRuntime,
  QwenVllmRuntimeError,
} from '../server/travel/runtimes/qwenVllmRuntime';
import {
  QWEN_GOLDEN_CASES,
  evaluateQwenGoldenObservations,
  type QwenGoldenObservation,
} from '../server/travel/qwenGoldenEvaluation';
import { AI_TOOL_CATALOG, type AiGatewayRequest } from '../src/travel/aiKnowledgeContracts';

const transportDescriptor = AI_TOOL_CATALOG.find((tool) => tool.id === 'transport.search')!;

function runtimeInput(requestId: string, withTransport = false): AiRuntimeInput {
  return {
    version: 1,
    requestId,
    prompt: 'Сформируй проверяемый ответ.',
    locale: 'ru-RU',
    scope: 'trip',
    tripId: 'trip-qwen',
    evidence: [],
    tools: withTransport ? [{ ...transportDescriptor, allowedDomains: [...transportDescriptor.allowedDomains] }] : [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function answerResponse(requestId: string, answer: Record<string, unknown>): Response {
  return jsonResponse({
    id: 'chatcmpl-fixture',
    object: 'chat.completion',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({ version: 1, requestId, ...answer }),
      },
    }],
  });
}

async function expectRuntimeError(promise: Promise<unknown>, code: QwenVllmRuntimeError['code']): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof QwenVllmRuntimeError && error.code === code);
}

async function main() {
  assert.throws(
    () => new QwenVllmRuntime({ baseUrl: 'http://remote.example.test/v1' }),
    (error: unknown) => error instanceof QwenVllmRuntimeError && error.code === 'invalid_configuration',
  );
  assert.throws(
    () => new QwenVllmRuntime({ baseUrl: 'https://user:secret@example.test/v1' }),
    (error: unknown) => error instanceof QwenVllmRuntimeError && error.code === 'invalid_configuration',
  );

  let capturedPayload: Record<string, unknown> | undefined;
  const answerFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(_url), 'http://127.0.0.1:8000/v1/chat/completions');
    assert.equal(init?.method, 'POST');
    capturedPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return answerResponse('qwen-answer', {
      message: 'Можно начать с общей структуры поездки.',
      claims: [{
        id: 'general-advice',
        domain: 'general',
        statement: 'Это рекомендация, а не внешний факт.',
        mode: 'inference',
        evidenceIds: [],
      }],
    });
  }) as typeof fetch;
  const answerRuntime = new QwenVllmRuntime({
    baseUrl: 'http://127.0.0.1:8000/v1',
    fetchImpl: answerFetch,
  });
  const answerTurn = await answerRuntime.generate(runtimeInput('qwen-answer', true), new AbortController().signal);
  assert.equal(answerTurn.kind, 'answer');
  assert.equal(answerTurn.requestId, 'qwen-answer');
  assert.equal(capturedPayload?.model, 'Qwen/Qwen3-8B');
  assert.equal(capturedPayload?.tool_choice, 'auto');
  assert.equal(capturedPayload?.temperature, 0.7);
  assert.equal(capturedPayload?.top_p, 0.8);
  assert.equal(capturedPayload?.top_k, 20);
  assert.deepEqual(capturedPayload?.chat_template_kwargs, { enable_thinking: false });
  assert.equal((capturedPayload?.response_format as { type?: string })?.type, 'json_schema');
  const tools = capturedPayload?.tools as Array<{ function?: { name?: string } }>;
  assert.deepEqual(tools.map((tool) => tool.function?.name), ['transport_search']);
  assert.equal(JSON.stringify(capturedPayload).includes('accountScopeId'), false, 'server account scope must never enter vLLM payload');

  const toolFetch = (async () => jsonResponse({
    choices: [{
      index: 0,
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'qwen-call-1',
          type: 'function',
          function: { name: 'transport_search', arguments: '{"intent":"best-price"}' },
        }],
      },
    }],
  })) as typeof fetch;
  const toolRuntime = new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: toolFetch });
  const toolTurn = await toolRuntime.generate(runtimeInput('qwen-tool', true), new AbortController().signal);
  assert.deepEqual(toolTurn, {
    version: 1,
    requestId: 'qwen-tool',
    kind: 'tool_calls',
    calls: [{ id: 'qwen-call-1', toolId: 'transport.search', input: { intent: 'best-price' } }],
  });

  const unknownToolFetch = (async () => jsonResponse({
    choices: [{
      message: {
        role: 'assistant',
        tool_calls: [{ id: 'unknown-call', type: 'function', function: { name: 'shell_exec', arguments: '{}' } }],
      },
    }],
  })) as typeof fetch;
  await expectRuntimeError(
    new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: unknownToolFetch })
      .generate(runtimeInput('qwen-unknown', true), new AbortController().signal),
    'invalid_response',
  );

  const malformedArgsFetch = (async () => jsonResponse({
    choices: [{
      message: {
        role: 'assistant',
        tool_calls: [{ id: 'bad-args', type: 'function', function: { name: 'transport_search', arguments: '{not-json' } }],
      },
    }],
  })) as typeof fetch;
  await expectRuntimeError(
    new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: malformedArgsFetch })
      .generate(runtimeInput('qwen-bad-args', true), new AbortController().signal),
    'invalid_response',
  );

  const malformedAnswerFetch = (async () => jsonResponse({
    choices: [{ message: { role: 'assistant', content: 'not-json' } }],
  })) as typeof fetch;
  await expectRuntimeError(
    new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: malformedAnswerFetch })
      .generate(runtimeInput('qwen-bad-answer'), new AbortController().signal),
    'invalid_response',
  );

  const httpErrorFetch = (async () => jsonResponse({ error: { message: 'fixture' } }, 503)) as typeof fetch;
  await expectRuntimeError(
    new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: httpErrorFetch })
      .generate(runtimeInput('qwen-http'), new AbortController().signal),
    'http_error',
  );

  const hangingFetch = (async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')), { once: true });
  })) as typeof fetch;
  const caller = new AbortController();
  const cancelledPromise = new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: hangingFetch, timeoutMs: 1_000 })
    .generate(runtimeInput('qwen-cancel'), caller.signal);
  setTimeout(() => caller.abort(new Error('caller-cancelled')), 10);
  await expectRuntimeError(cancelledPromise, 'aborted');

  await expectRuntimeError(
    new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: hangingFetch, timeoutMs: 15 })
      .generate(runtimeInput('qwen-timeout'), new AbortController().signal),
    'timeout',
  );

  const unsupportedPriceRuntime = new QwenVllmRuntime({
    baseUrl: 'http://localhost:8000/v1',
    fetchImpl: (async () => answerResponse('qwen-price-reject', {
      message: 'Билет стоит 10 000 ₽.',
      claims: [{ id: 'unsupported-price', domain: 'price', statement: 'Билет стоит 10 000 ₽.', mode: 'fact', evidenceIds: [] }],
    })) as typeof fetch,
  });
  const tripRequest = {
    version: 1,
    prompt: 'Назови актуальную цену.',
    locale: 'ru-RU',
    scope: 'trip',
  } satisfies AiGatewayRequest;
  await assert.rejects(
    new AiGateway({ runtime: unsupportedPriceRuntime, requestId: () => 'qwen-price-reject' })
      .run(tripRequest, { accountScopeId: 'acct-qwen', authorizedTripId: 'trip-qwen' }),
    (error: unknown) => error instanceof AiGatewayError && error.code === 'invalid_model_output',
  );

  let gatewayRound = 0;
  const gatewayFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    gatewayRound += 1;
    const payload = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
    if (gatewayRound === 1) {
      return jsonResponse({
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{ id: 'qwen-price-call', type: 'function', function: { name: 'transport_search', arguments: '{"intent":"best-price"}' } }],
          },
        }],
      });
    }
    assert.equal(JSON.stringify(payload.messages).includes('tool:qwen-price-call:price-1'), true, 'tool evidence must be present in the next normalized runtime context');
    return answerResponse('qwen-price-ok', {
      message: 'Подтверждённая цена получена из transport.search.',
      claims: [{
        id: 'price-fact',
        domain: 'price',
        statement: 'Цена подтверждена transport.search.',
        mode: 'fact',
        evidenceIds: ['tool:qwen-price-call:price-1'],
      }],
    });
  }) as typeof fetch;
  const gatewayRuntime = new QwenVllmRuntime({ baseUrl: 'http://localhost:8000/v1', fetchImpl: gatewayFetch });
  const registry = new AiToolRegistry([{
    id: 'transport.search',
    async handler(input, context) {
      assert.deepEqual(input, { intent: 'best-price' });
      assert.equal(context.accountScopeId, 'acct-qwen');
      return {
        evidence: [{
          id: 'price-1',
          domain: 'price',
          text: 'Provider-confirmed price.',
          freshness: 'current',
          sourceType: 'provider',
          providerId: 'fixture-transport',
          retrievedAt: '2026-09-10T00:00:00.000Z',
        }],
      };
    },
  }]);
  const gatewayResult = await new AiGateway({
    runtime: gatewayRuntime,
    tools: registry,
    requestId: () => 'qwen-price-ok',
    now: () => new Date('2026-09-10T00:00:00.000Z'),
  }).run(tripRequest, { accountScopeId: 'acct-qwen', authorizedTripId: 'trip-qwen' });
  assert.equal(gatewayResult.evaluation[0]?.authoritative, true);
  assert.equal(gatewayResult.evaluation[0]?.reason, 'tool_evidence');

  const missingSemantic: QwenGoldenObservation[] = QWEN_GOLDEN_CASES.map((testCase) => ({
    id: testCase.id,
    outcome: testCase.expectedOutcome,
    ...('expectedErrorCode' in testCase ? { errorCode: testCase.expectedErrorCode } : {}),
    claims: testCase.id === 'tool_backed_price_can_be_authoritative'
      ? [{ domain: 'price', mode: 'fact', authoritative: true }]
      : testCase.id === 'externally_checkable_prose_has_structured_claims'
        ? [{ domain: 'general', mode: 'fact', authoritative: true }]
        : testCase.id === 'general_advice_stays_inference'
          ? [{ domain: 'general', mode: 'inference', authoritative: false }]
          : [],
  }));
  const missingSemanticReport = evaluateQwenGoldenObservations(missingSemantic);
  assert.equal(missingSemanticReport.passed, false, 'semantic coverage cannot be inferred from schema-only success');
  assert.deepEqual(
    missingSemanticReport.failed.sort(),
    ['externally_checkable_prose_has_structured_claims', 'tool_backed_price_can_be_authoritative'].sort(),
  );

  const completeGolden = missingSemantic.map((observation) => ({
    ...observation,
    ...(observation.id === 'externally_checkable_prose_has_structured_claims' || observation.id === 'tool_backed_price_can_be_authoritative'
      ? { semanticCoveragePassed: true }
      : {}),
  }));
  const completeReport = evaluateQwenGoldenObservations(completeGolden);
  assert.equal(completeReport.passed, true);
  assert.deepEqual(completeReport.missing, []);
  assert.deepEqual(completeReport.failed, []);

  console.log('Qwen Runtime Adapter & AI Evaluation V1: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
