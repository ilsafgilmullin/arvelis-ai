import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AiRuntimeInput } from '../server/travel/aiEnginePorts';
import {
  QWEN_LLAMACPP_ADAPTER_VERSION,
  QWEN_LLAMACPP_MAX_RESPONSE_BYTES,
  QwenLlamaCppRuntime,
  QwenLlamaCppRuntimeError,
} from '../server/travel/runtimes/qwenLlamaCppRuntime';
import { AI_TOOL_CATALOG } from '../src/travel/aiKnowledgeContracts';
import { QWEN_GOLDEN_CASES } from '../server/travel/qwenGoldenEvaluation';

const transportDescriptor = AI_TOOL_CATALOG.find((tool) => tool.id === 'transport.search')!;

function runtimeInput(requestId: string, withTransport = false, withTransportEvidence = false): AiRuntimeInput {
  return {
    version: 1,
    requestId,
    prompt: 'Сформируй synthetic evaluation response.',
    locale: 'ru-RU',
    scope: 'trip',
    tripId: 'synthetic-trip',
    evidence: withTransportEvidence ? [{
      id: 'tool:required-transport-search-v1:synthetic-price-current',
      origin: 'tool',
      domain: 'price',
      text: 'SYNTHETIC EVALUATION ONLY: normalized provider price is 12345 RUB.',
      freshness: 'current',
      sourceType: 'provider',
      toolId: 'transport.search',
      providerId: 'synthetic-transport-provider',
      retrievedAt: '2026-09-13T00:00:00.000Z',
    }] : [],
    tools: withTransport ? [{ ...transportDescriptor, allowedDomains: [...transportDescriptor.allowedDomains] }] : [],
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function requestIdFrom(payload: Record<string, unknown>): string {
  const messages = payload.messages as Array<{ content?: string }>;
  const context = messages[1]?.content ?? '';
  const match = context.match(/"requestId":"([A-Za-z0-9._:-]+)"/);
  if (!match?.[1]) throw new Error('requestId missing from runtime context');
  return match[1];
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function answer(requestId: string) {
  return {
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({
          version: 1,
          requestId,
          message: 'Synthetic structured response.',
          claims: [{
            id: 'synthetic-inference',
            domain: 'general',
            statement: 'Synthetic inference only.',
            mode: 'inference',
            evidenceIds: [],
          }],
        }),
      },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
    timings: { predicted_per_second: 12.5 },
  };
}

async function expectRuntimeError(promise: Promise<unknown>, code: QwenLlamaCppRuntimeError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof QwenLlamaCppRuntimeError && error.code === code);
}

async function main() {
  assert.equal(QWEN_LLAMACPP_ADAPTER_VERSION, 3);
  const captured = new Map<string, Record<string, unknown>>();
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404).end();
      return;
    }
    const payload = await readJson(req);
    const requestId = requestIdFrom(payload);
    captured.set(requestId, payload);

    if (requestId === 'bad-json-case') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not-json');
      return;
    }
    if (requestId === 'plain-case') {
      sendJson(res, { choices: [{ message: { role: 'assistant', content: 'plain free-form answer' } }] });
      return;
    }
    if (requestId === 'unknown-tool-case') {
      sendJson(res, { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'unknown-1', type: 'function', function: { name: 'shell_exec', arguments: '{}' } }] } }] });
      return;
    }
    if (requestId === 'unavailable-tool-case') {
      sendJson(res, { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'unavailable-1', type: 'function', function: { name: 'legal_check', arguments: '{}' } }] } }] });
      return;
    }
    if (requestId === 'malformed-tool-case') {
      sendJson(res, { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'malformed-1', type: 'function', function: { name: 'transport_search', arguments: '{bad-json' } }] } }] });
      return;
    }
    if (requestId === 'tool-case') {
      sendJson(res, { choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'transport_search', arguments: '{"intent":"best-price"}' } }] } }] });
      return;
    }
    if (requestId === 'timeout-case' || requestId === 'cancel-case') {
      setTimeout(() => {
        if (!res.writableEnded) sendJson(res, answer(requestId));
      }, 250);
      return;
    }
    if (requestId === 'size-case') {
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(QWEN_LLAMACPP_MAX_RESPONSE_BYTES + 1),
      });
      res.end('x');
      return;
    }
    sendJson(res, answer(requestId));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  try {
    assert.throws(
      () => new QwenLlamaCppRuntime({ baseUrl: 'http://remote.example.test:8080/v1' }),
      (error: unknown) => error instanceof QwenLlamaCppRuntimeError && error.code === 'invalid_configuration',
    );
    assert.throws(
      () => new QwenLlamaCppRuntime({ baseUrl: 'https://127.0.0.1:8080/v1' }),
      (error: unknown) => error instanceof QwenLlamaCppRuntimeError && error.code === 'invalid_configuration',
    );
    assert.doesNotThrow(() => new QwenLlamaCppRuntime({ baseUrl: 'http://localhost:8080/v1' }));
    assert.doesNotThrow(() => new QwenLlamaCppRuntime({ baseUrl: 'http://[::1]:8080/v1' }));

    const runtime = new QwenLlamaCppRuntime({ baseUrl });
    const turn = await runtime.generate(runtimeInput('mapping-case', true), new AbortController().signal);
    assert.equal(turn.kind, 'answer');
    const payload = captured.get('mapping-case')!;
    assert.equal(payload.model, 'arvelis-qwen3-8b-q4-k-m-v1');
    assert.equal(payload.stream, false);
    assert.equal(payload.tool_choice, 'auto');
    assert.equal(payload.temperature, 0.7);
    assert.equal(payload.top_p, 0.8);
    assert.equal(payload.top_k, 20);
    assert.equal(payload.seed, -1);
    assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: false });
    assert.equal(payload.reasoning_effort, 'none');
    assert.equal((payload.response_format as { type?: string })?.type, 'json_schema');
    const schema = ((payload.response_format as { json_schema?: { schema?: Record<string, unknown> } }).json_schema?.schema)!;
    assert.equal(schema.type, 'object');
    assert.equal((schema.properties as Record<string, unknown>).requestId !== undefined, true);
    const tools = payload.tools as Array<{ function?: { name?: string } }>;
    assert.deepEqual(tools.map((item) => item.function?.name), ['transport_search']);
    assert.equal(JSON.stringify(payload).includes('accountScopeId'), false);
    const baseMessages = payload.messages as Array<{ content?: string }>;
    assert.equal(baseMessages[0]?.content?.includes('server-side tool call has already completed'), false);
    const exchanges = runtime.drainLocalExchanges();
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]?.promptTokens, 100);
    assert.equal(exchanges[0]?.completionTokens, 20);
    assert.equal(exchanges[0]?.predictedTokensPerSecond, 12.5);

    const postToolRuntime = new QwenLlamaCppRuntime({ baseUrl });
    await postToolRuntime.generate(runtimeInput('post-tool-policy-case', true, true), new AbortController().signal);
    const postToolPayload = captured.get('post-tool-policy-case')!;
    const postToolMessages = postToolPayload.messages as Array<{ content?: string }>;
    const postToolPolicy = postToolMessages[0]?.content ?? '';
    const postToolContext = postToolMessages[1]?.content ?? '';
    assert.equal(postToolPolicy.includes('server-side tool call has already completed'), true);
    assert.equal(postToolPolicy.includes('state that supported fact directly in message'), true);
    assert.equal(postToolPolicy.includes('Do not narrate, simulate, or repeat a completed tool call'), true);
    assert.equal(postToolContext.includes('tool:required-transport-search-v1:synthetic-price-current'), true);
    assert.equal(postToolContext.includes('"freshness":"current"'), true);

    // Run #8 reproduced a status-only message despite a correct numeric claim.
    // Lock the post-tool task at the model input boundary, without repairing output.
    const pricePrompt = QWEN_GOLDEN_CASES.find((item) => item.id === 'tool_backed_price_can_be_authoritative')!.prompt;
    const regressionInput = { ...runtimeInput('post-tool-regression-case', true, true), prompt: pricePrompt };
    await postToolRuntime.generate(regressionInput, new AbortController().signal);
    const regressionPayload = captured.get('post-tool-regression-case')!;
    const regressionMessages = regressionPayload.messages as Array<{ role: string; content: string }>;
    const responseTask = regressionMessages.at(-1)!;
    assert.equal(responseTask.role, 'user');
    assert.equal(responseTask.content.includes(pricePrompt), true, 'preserve the original user request');
    assert.equal(responseTask.content.includes('CURRENT TASK: answer the informational request using the supplied evidence'), true);
    assert.equal(responseTask.content.includes('numeric amount AND currency'), true);
    assert.equal(responseTask.content.includes('Do not describe tool execution in message'), true);
    assert.equal(responseTask.content.includes('exact existing evidence ID'), true);
    assert.equal(responseTask.content.includes('expired or unknown'), true);
    assert.equal(responseTask.content.includes('12345'), false, 'no fixture value in the response policy');
    assert.equal(responseTask.content.includes('synthetic-price-current'), false, 'no fixture evidence ID in the response policy');
    assert.equal(baseMessages.at(-1)?.content, runtimeInput('mapping-case').prompt, 'pre-tool prompt stays unchanged');

    const staleInput = runtimeInput('post-tool-expired-policy-case', true, true);
    staleInput.evidence[0] = { ...staleInput.evidence[0]!, freshness: 'expired' };
    await postToolRuntime.generate(staleInput, new AbortController().signal);
    const staleMessages = captured.get('post-tool-expired-policy-case')!.messages as Array<{ content: string }>;
    assert.equal(staleMessages[1]?.content.includes('"freshness":"expired"'), true);
    assert.equal(staleMessages.at(-1)?.content.includes('do not report a current protected fact'), true);

    const defectiveAnswer = {
      version: 1 as const,
      requestId: 'status-only-regression-case',
      message: 'Цена была успешно получена через вызов transport.search.',
      claims: [{
        id: 'price-claim', domain: 'price' as const,
        statement: 'Цена составляет 12345 РУБ.', mode: 'fact' as const,
        evidenceIds: ['tool:required-transport-search-v1:synthetic-price-current'],
      }],
    };
    const unmodifiedOutput = await new QwenLlamaCppRuntime({
      baseUrl,
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{
        message: { role: 'assistant', content: JSON.stringify(defectiveAnswer) },
      }] }), { headers: { 'content-type': 'application/json' } }),
    }).generate(runtimeInput(defectiveAnswer.requestId, true, true), new AbortController().signal);
    assert.equal(unmodifiedOutput.kind, 'answer');
    if (unmodifiedOutput.kind === 'answer') assert.deepEqual(unmodifiedOutput.answer, defectiveAnswer,
      'semantic defects must remain observable; the adapter must not rewrite message from claims');

    const reproducible = new QwenLlamaCppRuntime({ baseUrl, samplingProfile: 'reproducible' });
    await reproducible.generate(runtimeInput('repro-case'), new AbortController().signal);
    const reproPayload = captured.get('repro-case')!;
    assert.equal(reproPayload.temperature, 0);
    assert.equal(reproPayload.top_p, 1);
    assert.equal(reproPayload.top_k, 1);
    assert.equal(reproPayload.seed, 424242);

    const toolTurn = await new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('tool-case', true), new AbortController().signal);
    assert.deepEqual(toolTurn, {
      version: 1,
      requestId: 'tool-case',
      kind: 'tool_calls',
      calls: [{ id: 'tool-1', toolId: 'transport.search', input: { intent: 'best-price' } }],
    });

    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('bad-json-case'), new AbortController().signal),
      'invalid_response',
    );
    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('plain-case'), new AbortController().signal),
      'invalid_response',
    );
    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('unknown-tool-case', true), new AbortController().signal),
      'invalid_response',
    );
    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('unavailable-tool-case', true), new AbortController().signal),
      'invalid_response',
    );
    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('malformed-tool-case', true), new AbortController().signal),
      'invalid_response',
    );

    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl, timeoutMs: 20 }).generate(runtimeInput('timeout-case'), new AbortController().signal),
      'timeout',
    );

    const caller = new AbortController();
    const cancelled = new QwenLlamaCppRuntime({ baseUrl, timeoutMs: 1_000 }).generate(runtimeInput('cancel-case'), caller.signal);
    setTimeout(() => caller.abort(new Error('test-cancel')), 20);
    await expectRuntimeError(cancelled, 'aborted');

    await expectRuntimeError(
      new QwenLlamaCppRuntime({ baseUrl }).generate(runtimeInput('size-case'), new AbortController().signal),
      'response_too_large',
    );

    console.log('Qwen llama.cpp local runtime deterministic gate: PASS');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
