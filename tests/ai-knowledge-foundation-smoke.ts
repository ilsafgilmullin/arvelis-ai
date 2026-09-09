import assert from 'node:assert/strict';
import {
  AI_FOUNDATION_CRITICAL_EVAL_IDS,
  evaluateAiFoundationReleaseGate,
} from '../server/travel/aiEvaluationPolicy';
import { AiGateway, AiGatewayError } from '../server/travel/aiGateway';
import type { AiModelRuntime, KnowledgeRetriever } from '../server/travel/aiEnginePorts';
import { AiToolRegistry } from '../server/travel/aiToolRegistry';
import type { AiGatewayRequest, AiModelTurn } from '../src/travel/aiKnowledgeContracts';

const now = new Date('2026-09-09T11:30:00.000Z');
const tripRequest = {
  version: 1,
  prompt: 'Найди подходящий вариант и объясни только то, что подтверждено источниками.',
  locale: 'ru-RU',
  scope: 'trip',
} satisfies AiGatewayRequest;
const context = { accountScopeId: 'acct-ai', authorizedTripId: 'trip-ai' };

async function expectGatewayError(promise: Promise<unknown>, code: AiGatewayError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof AiGatewayError && error.code === code);
}

async function main() {
  await expectGatewayError(
    new AiGateway({ runtime: null, now: () => now, requestId: () => 'ai-not-connected' }).run(tripRequest, context),
    'not_connected',
  );

  await expectGatewayError(
    new AiGateway({
      runtime: {
        id: 'runtime-fixture',
        async generate(input) {
          return { version: 1, requestId: input.requestId, kind: 'answer', answer: { version: 1, requestId: input.requestId, message: 'ok', claims: [] } };
        },
      },
      now: () => now,
      requestId: () => 'ai-trip-context',
    }).run(tripRequest, { accountScopeId: 'acct-ai' }),
    'invalid_input',
  );

  let runtimeSawAccountScope = false;
  const advisoryRuntime: AiModelRuntime = {
    id: 'runtime-advisory',
    async generate(input) {
      runtimeSawAccountScope = 'accountScopeId' in input;
      assert.equal(input.tripId, 'trip-ai');
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Можно начать с общей структуры поездки.',
          claims: [{ id: 'planning-advice', domain: 'general', statement: 'Это рекомендация модели, а не внешний факт.', mode: 'inference', evidenceIds: [] }],
        },
      };
    },
  };
  const advisory = await new AiGateway({ runtime: advisoryRuntime, now: () => now, requestId: () => 'ai-advisory' }).run(tripRequest, context);
  assert.equal(runtimeSawAccountScope, false, 'server account scope must not be exposed to model runtime input');
  assert.equal(advisory.evaluation[0]?.authoritative, false);
  assert.equal(advisory.evaluation[0]?.reason, 'model_inference');
  assert.equal(advisory.audit.retrievalStatus, 'not_connected');

  const transportRegistry = new AiToolRegistry([{
    id: 'transport.search',
    async handler(input, toolContext) {
      assert.equal(toolContext.accountScopeId, 'acct-ai');
      assert.equal(toolContext.authorizedTripId, 'trip-ai');
      assert.deepEqual(input, { intent: 'best-price' });
      return {
        evidence: [{
          id: 'price-1',
          domain: 'price',
          text: 'Проверенная цена из transport provider.',
          freshness: 'current',
          sourceType: 'provider',
          providerId: 'transport-fixture',
          sourceUrl: 'https://transport.example.test/quote/1',
          retrievedAt: now.toISOString(),
        }],
      };
    },
  }]);
  let transportRound = 0;
  const transportRuntime: AiModelRuntime = {
    id: 'runtime-transport',
    async generate(input) {
      transportRound += 1;
      if (transportRound === 1) {
        assert.deepEqual(input.tools.map((tool) => tool.id), ['transport.search']);
        return {
          version: 1,
          requestId: input.requestId,
          kind: 'tool_calls',
          calls: [{ id: 'transport-call-1', toolId: 'transport.search', input: { intent: 'best-price' } }],
        };
      }
      const evidence = input.evidence.find((item) => item.id === 'tool:transport-call-1:price-1');
      assert.ok(evidence);
      assert.equal(evidence.toolId, 'transport.search');
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Цена подтверждена transport tool evidence.',
          claims: [{ id: 'price-fact', domain: 'price', statement: 'Цена подтверждена provider evidence.', mode: 'fact', evidenceIds: [evidence.id] }],
        },
      };
    },
  };
  const transportResult = await new AiGateway({
    runtime: transportRuntime,
    tools: transportRegistry,
    now: () => now,
    requestId: () => 'ai-transport',
  }).run(tripRequest, context);
  assert.equal(transportResult.audit.toolCallsExecuted, 1);
  assert.equal(transportResult.evaluation[0]?.authoritative, true);
  assert.equal(transportResult.evaluation[0]?.reason, 'tool_evidence');

  const unsupportedPriceRuntime: AiModelRuntime = {
    id: 'runtime-unsupported-price',
    async generate(input) {
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Неподтверждённая цена не должна пройти.',
          claims: [{ id: 'unsupported-price', domain: 'price', statement: 'Цена 10 000 ₽.', mode: 'fact', evidenceIds: [] }],
        },
      };
    },
  };
  await assert.rejects(
    new AiGateway({ runtime: unsupportedPriceRuntime, now: () => now, requestId: () => 'ai-unsupported-price' }).run(tripRequest, context),
    (error: unknown) => error instanceof AiGatewayError
      && error.code === 'invalid_model_output'
      && Boolean(error.validationErrors?.some((item) => item.code === 'protected_fact_requires_tool_evidence')),
  );

  const legalKnowledgeRetriever: KnowledgeRetriever = {
    id: 'retriever-legal-knowledge',
    async retrieve(query) {
      return {
        version: 1,
        queryId: query.queryId,
        sources: [{
          id: 'official-doc',
          title: 'Official document',
          publisher: 'Official authority',
          sourceType: 'official',
          url: 'https://authority.example.test/rules',
          retrievedAt: now.toISOString(),
          validUntil: '2026-12-31T23:59:59.000Z',
        }],
        chunks: [{ id: 'legal-chunk', sourceId: 'official-doc', domain: 'legal', text: 'Legal source text.', relevance: 1 }],
      };
    },
  };
  const knowledgeOnlyLegalRuntime: AiModelRuntime = {
    id: 'runtime-knowledge-legal',
    async generate(input) {
      const evidence = input.evidence.find((item) => item.id === 'knowledge:legal-chunk');
      assert.ok(evidence);
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'RAG alone must not authorize a Legal fact.',
          claims: [{ id: 'legal-from-rag', domain: 'legal', statement: 'Legal fact.', mode: 'fact', evidenceIds: [evidence.id] }],
        },
      };
    },
  };
  await assert.rejects(
    new AiGateway({ runtime: knowledgeOnlyLegalRuntime, retriever: legalKnowledgeRetriever, now: () => now, requestId: () => 'ai-knowledge-legal' }).run(tripRequest, context),
    (error: unknown) => error instanceof AiGatewayError
      && error.code === 'invalid_model_output'
      && Boolean(error.validationErrors?.some((item) => item.code === 'protected_fact_requires_tool_evidence')),
  );

  const legalRegistry = new AiToolRegistry([{
    id: 'legal.check',
    async handler() {
      return {
        evidence: [{
          id: 'legal-official',
          domain: 'legal',
          text: 'Route-general legal requirement from normalized Legal tool.',
          freshness: 'current',
          sourceType: 'official',
          sourceUrl: 'https://authority.example.test/entry',
          retrievedAt: now.toISOString(),
        }],
      };
    },
  }]);
  let legalRound = 0;
  const legalRuntime: AiModelRuntime = {
    id: 'runtime-legal',
    async generate(input) {
      legalRound += 1;
      if (legalRound === 1) {
        return { version: 1, requestId: input.requestId, kind: 'tool_calls', calls: [{ id: 'legal-call-1', toolId: 'legal.check', input: {} }] };
      }
      const evidence = input.evidence.find((item) => item.id === 'tool:legal-call-1:legal-official');
      assert.ok(evidence);
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: {
          version: 1,
          requestId: input.requestId,
          message: 'Legal statement is source-backed by the Legal tool.',
          claims: [{ id: 'legal-fact', domain: 'legal', statement: 'Route-general legal fact.', mode: 'fact', evidenceIds: [evidence.id] }],
        },
      };
    },
  };
  const legalResult = await new AiGateway({ runtime: legalRuntime, tools: legalRegistry, now: () => now, requestId: () => 'ai-legal' }).run(tripRequest, context);
  assert.equal(legalResult.evaluation[0]?.authoritative, true);

  const staleTransportRegistry = new AiToolRegistry([{
    id: 'transport.search',
    async handler() {
      return { evidence: [{ id: 'stale-price', domain: 'price', text: 'Stale provider price.', freshness: 'expired', sourceType: 'provider' }] };
    },
  }]);
  let staleRound = 0;
  const staleRuntime: AiModelRuntime = {
    id: 'runtime-stale',
    async generate(input) {
      staleRound += 1;
      if (staleRound === 1) return { version: 1, requestId: input.requestId, kind: 'tool_calls', calls: [{ id: 'stale-call', toolId: 'transport.search', input: {} }] };
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'answer',
        answer: { version: 1, requestId: input.requestId, message: 'Stale price must fail.', claims: [{ id: 'stale-price-claim', domain: 'price', statement: 'Stale price.', mode: 'fact', evidenceIds: ['tool:stale-call:stale-price'] }] },
      };
    },
  };
  await expectGatewayError(
    new AiGateway({ runtime: staleRuntime, tools: staleTransportRegistry, now: () => now, requestId: () => 'ai-stale' }).run(tripRequest, context),
    'invalid_model_output',
  );

  const malformedRetriever: KnowledgeRetriever = {
    id: 'retriever-malformed',
    async retrieve(query) {
      return {
        version: 1,
        queryId: query.queryId,
        sources: [{ id: 'bad-source', title: 'Bad source', publisher: 'Bad', sourceType: 'official', url: 'http://insecure.example.test', retrievedAt: now.toISOString() }],
        chunks: [],
      };
    },
  };
  await expectGatewayError(
    new AiGateway({ runtime: advisoryRuntime, retriever: malformedRetriever, now: () => now, requestId: () => 'ai-bad-retrieval' }).run(tripRequest, context),
    'invalid_retrieval_response',
  );

  const unknownToolRuntime: AiModelRuntime = {
    id: 'runtime-unknown-tool',
    async generate(input) {
      return {
        version: 1,
        requestId: input.requestId,
        kind: 'tool_calls',
        calls: [{ id: 'unknown-call', toolId: 'weather.lookup', input: {} }],
      } as unknown as AiModelTurn;
    },
  };
  await expectGatewayError(
    new AiGateway({ runtime: unknownToolRuntime, now: () => now, requestId: () => 'ai-unknown-tool' }).run(tripRequest, context),
    'invalid_model_output',
  );

  const cancelled = new AbortController();
  cancelled.abort();
  await expectGatewayError(
    new AiGateway({ runtime: advisoryRuntime, now: () => now, requestId: () => 'ai-cancel' }).run(tripRequest, context, cancelled.signal),
    'aborted',
  );

  const neverRuntime: AiModelRuntime = {
    id: 'runtime-never',
    async generate() {
      return new Promise<AiModelTurn>(() => undefined);
    },
  };
  await expectGatewayError(
    new AiGateway({ runtime: neverRuntime, timeoutMs: 20, now: () => now, requestId: () => 'ai-timeout' }).run(tripRequest, context),
    'timeout',
  );

  const incompleteGate = evaluateAiFoundationReleaseGate([]);
  assert.equal(incompleteGate.passed, false);
  assert.equal(incompleteGate.missing.length, AI_FOUNDATION_CRITICAL_EVAL_IDS.length);
  const completeGate = evaluateAiFoundationReleaseGate(AI_FOUNDATION_CRITICAL_EVAL_IDS.map((id) => ({ id, passed: true })));
  assert.deepEqual(completeGate, { passed: true, missing: [], failed: [] });

  console.log('ARVELIS AI Engine & Knowledge Foundation: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
