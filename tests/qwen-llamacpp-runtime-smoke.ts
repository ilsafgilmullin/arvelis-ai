import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AiRuntimeInput } from '../server/travel/aiEnginePorts';
import {
  QWEN_LLAMACPP_MAX_RESPONSE_BYTES,
  QwenLlamaCppRuntime,
  QwenLlamaCppRuntimeError,
} from '../server/travel/runtimes/qwenLlamaCppRuntime';
import { AI_TOOL_CATALOG } from '../src/travel/aiKnowledgeContracts';

const transportDescriptor = AI_TOOL_CATALOG.find((tool) => tool.id === 'transport.search')!;

function runtimeInput(requestId: string, withTransport = false): AiRuntimeInput {
  return {
    version: 1,
    requestId,
    prompt: 'Сформируй synthetic evaluation response.',
    locale: 'ru-RU',
    scope: 'trip',
    tripId: 'synthetic-trip',
    evidence: [],
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
    const exchanges = runtime.drainLocalExchanges();
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0]?.promptTokens, 100);
    assert.equal(exchanges[0]?.completionTokens, 20);
    assert.equal(exchanges[0]?.predictedTokensPerSecond, 12.5);

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
