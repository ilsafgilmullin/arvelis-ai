import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AiGateway, AiGatewayError } from './aiGateway';
import type { KnowledgeRetriever } from './aiEnginePorts';
import { AiToolRegistry } from './aiToolRegistry';
import {
  QWEN_GOLDEN_CASES,
  runQwenGoldenEvaluation,
  type QwenGoldenCase,
  type QwenGoldenCaseId,
  type QwenGoldenEvaluationReport,
  type QwenGoldenObservation,
} from './qwenGoldenEvaluation';
import {
  QWEN_LLAMACPP_ADAPTER_VERSION,
  QwenLlamaCppRuntime,
  QwenLlamaCppRuntimeError,
  type QwenLlamaCppLocalExchange,
  type QwenLlamaCppSamplingProfile,
} from './runtimes/qwenLlamaCppRuntime';

const PROTECTED_DOMAINS = new Set(['transport_schedule', 'price', 'availability', 'map_route', 'legal', 'weather']);
const CURRENT_TOOL_CASES = new Set<QwenGoldenCaseId>([
  'tool_backed_price_can_be_authoritative',
  'externally_checkable_prose_has_structured_claims',
]);
const STALE_TOOL_CASES = new Set<QwenGoldenCaseId>(['stale_protected_fact_fails_closed']);

export type QwenLocalSemanticReview = Partial<Record<QwenGoldenCaseId, boolean>>;

export type QwenLocalLiveAttempt = {
  caseId: QwenGoldenCaseId;
  samplingProfile: QwenLlamaCppSamplingProfile;
  run: number;
  outcome: 'success' | 'rejected';
  errorCode?: string;
  runtimeErrorCode?: string;
  schemaPassed: boolean;
  protectedFactPolicyPassed: boolean;
  protectedFactViolationCount: number;
  toolCallsExecuted: number;
  semanticCoverageVerdict: 'pass' | 'fail' | 'not_reviewed' | 'not_required';
  latencyMs: number;
  modelExchanges: number;
  promptTokens?: number;
  completionTokens?: number;
  predictedTokensPerSecond?: number;
};

export type QwenLocalLiveEvaluationReport = {
  version: 1;
  generatedAt: string;
  status: 'QUALIFIED' | 'NOT_QUALIFIED';
  model: {
    repo: string;
    revision: string;
    filename: string;
    sha256: string;
    quantization: string;
  };
  llamaCpp: {
    release: string;
    commit: string;
    observedVersion: string;
  };
  runtime: {
    adapterId: string;
    adapterVersion: number;
    baseUrl: string;
    modelId: string;
    contextSize: number;
  };
  samplingProfiles: Array<{
    id: QwenLlamaCppSamplingProfile;
    runsPerCase: number;
  }>;
  casesAttempted: QwenGoldenCaseId[];
  attempts: number;
  structuredValidationRate: number;
  protectedFactPolicyRate: number;
  protectedFactViolations: number;
  semanticCoverage: Array<{
    caseId: QwenGoldenCaseId;
    verdict: 'pass' | 'fail' | 'not_reviewed';
  }>;
  toolSelection: Array<{
    caseId: QwenGoldenCaseId;
    attempts: number;
    attemptsWithExecutedTool: number;
  }>;
  timeoutCount: number;
  errorCount: number;
  latencyMs: {
    min: number | null;
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
  predictedTokensPerSecond: {
    samples: number;
    p50: number | null;
  };
  goldenRuns: Array<{
    samplingProfile: QwenLlamaCppSamplingProfile;
    run: number;
    passed: boolean;
    missing: QwenGoldenCaseId[];
    failed: QwenGoldenCaseId[];
  }>;
  qualificationReasons: string[];
};

type LiveConfig = {
  baseUrl: string;
  modelId: string;
  outputDir: string;
  contextSize: number;
  normalRuns: number;
  reproducibleRuns: number;
  modelRepo: string;
  modelRevision: string;
  modelFilename: string;
  modelSha256: string;
  quantization: string;
  llamaCppRelease: string;
  llamaCppCommit: string;
  llamaCppObservedVersion: string;
  semanticReview: QwenLocalSemanticReview;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid ${name}.`);
  return value;
}

function boundedIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in ${min}..${max}.`);
  return value;
}

async function loadSemanticReview(): Promise<QwenLocalSemanticReview> {
  const path = process.env.QWEN_LOCAL_SEMANTIC_REVIEW_FILE;
  if (!path) return {};
  const parsed = JSON.parse(await readFile(resolve(path), 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Semantic review file must contain a JSON object.');
  const review: QwenLocalSemanticReview = {};
  for (const testCase of QWEN_GOLDEN_CASES) {
    const value = (parsed as Record<string, unknown>)[testCase.id];
    if (value !== undefined && typeof value !== 'boolean') throw new Error(`Semantic review for ${testCase.id} must be boolean.`);
    if (typeof value === 'boolean') review[testCase.id] = value;
  }
  return review;
}

async function loadConfig(): Promise<LiveConfig> {
  return {
    baseUrl: requiredEnv('QWEN_LOCAL_BASE_URL'),
    modelId: requiredEnv('QWEN_LOCAL_MODEL_ID'),
    outputDir: resolve(process.env.QWEN_LOCAL_EVAL_OUTPUT_DIR ?? '.local-eval/qwen'),
    contextSize: boundedIntegerEnv('QWEN_LOCAL_CONTEXT_SIZE', 8192, 2048, 32768),
    normalRuns: boundedIntegerEnv('QWEN_LOCAL_NORMAL_RUNS', 3, 1, 5),
    reproducibleRuns: boundedIntegerEnv('QWEN_LOCAL_REPRODUCIBLE_RUNS', 1, 1, 3),
    modelRepo: requiredEnv('QWEN_LOCAL_MODEL_REPO'),
    modelRevision: requiredEnv('QWEN_LOCAL_MODEL_REVISION'),
    modelFilename: requiredEnv('QWEN_LOCAL_MODEL_FILENAME'),
    modelSha256: requiredEnv('QWEN_LOCAL_MODEL_SHA256'),
    quantization: requiredEnv('QWEN_LOCAL_QUANTIZATION'),
    llamaCppRelease: requiredEnv('QWEN_LOCAL_LLAMACPP_RELEASE'),
    llamaCppCommit: requiredEnv('QWEN_LOCAL_LLAMACPP_COMMIT'),
    llamaCppObservedVersion: requiredEnv('QWEN_LOCAL_LLAMACPP_VERSION_OBSERVED'),
    semanticReview: await loadSemanticReview(),
  };
}

function syntheticRetrieverFor(testCase: QwenGoldenCase): KnowledgeRetriever | null {
  if (testCase.id !== 'knowledge_only_legal_fails_closed') return null;
  return {
    id: 'synthetic-legal-retriever',
    async retrieve(query) {
      return {
        version: 1,
        queryId: query.queryId,
        sources: [{
          id: 'synthetic-legal-source',
          title: 'Synthetic legal evaluation source',
          publisher: 'ARVELIS test fixture',
          sourceType: 'official',
          retrievedAt: '2026-09-01T00:00:00.000Z',
          validUntil: '2026-12-31T23:59:59.000Z',
        }],
        chunks: [{
          id: 'synthetic-legal-chunk',
          sourceId: 'synthetic-legal-source',
          domain: 'legal',
          text: 'SYNTHETIC EVALUATION ONLY: fictional Testland requires Permit-Z for entry.',
          relevance: 0.99,
        }],
      };
    },
  };
}

function toolRegistryFor(testCase: QwenGoldenCase): AiToolRegistry {
  if (!CURRENT_TOOL_CASES.has(testCase.id) && !STALE_TOOL_CASES.has(testCase.id)) return new AiToolRegistry();
  const freshness = STALE_TOOL_CASES.has(testCase.id) ? 'expired' as const : 'current' as const;
  return new AiToolRegistry([{
    id: 'transport.search',
    async handler() {
      return {
        evidence: [{
          id: freshness === 'current' ? 'synthetic-price-current' : 'synthetic-price-expired',
          domain: 'price',
          text: freshness === 'current'
            ? 'SYNTHETIC EVALUATION ONLY: normalized provider price is 12345 RUB.'
            : 'SYNTHETIC EVALUATION ONLY: expired normalized provider price was 12345 RUB.',
          freshness,
          sourceType: 'provider',
          providerId: 'synthetic-transport-provider',
          retrievedAt: freshness === 'current' ? '2026-09-12T00:00:00.000Z' : '2025-01-01T00:00:00.000Z',
        }],
      };
    },
  }]);
}

function semanticVerdict(testCase: QwenGoldenCase, review: QwenLocalSemanticReview): QwenGoldenObservation['semanticCoveragePassed'] {
  if (!testCase.requiresSemanticCoverage) return undefined;
  return review[testCase.id];
}

function semanticLabel(testCase: QwenGoldenCase, review: QwenLocalSemanticReview): QwenLocalLiveAttempt['semanticCoverageVerdict'] {
  if (!testCase.requiresSemanticCoverage) return 'not_required';
  const value = review[testCase.id];
  return value === true ? 'pass' : value === false ? 'fail' : 'not_reviewed';
}

function runtimeErrorCode(error: unknown): string | undefined {
  if (!(error instanceof AiGatewayError)) return undefined;
  const cause = Object.getOwnPropertyDescriptor(error, 'cause')?.value as unknown;
  return cause instanceof QwenLlamaCppRuntimeError ? cause.code : undefined;
}

function observationFromGatewayError(testCase: QwenGoldenCase, error: AiGatewayError, review: QwenLocalSemanticReview): QwenGoldenObservation {
  return {
    id: testCase.id,
    outcome: 'rejected',
    errorCode: error.code,
    claims: [],
    ...(testCase.requiresSemanticCoverage && review[testCase.id] !== undefined
      ? { semanticCoveragePassed: review[testCase.id] }
      : {}),
  };
}

function aggregateExchangeMetrics(exchanges: readonly QwenLlamaCppLocalExchange[]) {
  const promptTokens = exchanges.reduce((sum, item) => sum + (item.promptTokens ?? 0), 0);
  const completionTokens = exchanges.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0);
  const tps = exchanges.flatMap((item) => item.predictedTokensPerSecond === undefined ? [] : [item.predictedTokensPerSecond]);
  return {
    ...(promptTokens > 0 ? { promptTokens } : {}),
    ...(completionTokens > 0 ? { completionTokens } : {}),
    ...(tps.length > 0 ? { predictedTokensPerSecond: tps.reduce((a, b) => a + b, 0) / tps.length } : {}),
  };
}

async function persistRawExchanges(
  outputDir: string,
  profile: QwenLlamaCppSamplingProfile,
  run: number,
  caseId: QwenGoldenCaseId,
  exchanges: readonly QwenLlamaCppLocalExchange[],
): Promise<void> {
  if (exchanges.length === 0) return;
  const rawDir = resolve(outputDir, 'raw');
  await mkdir(rawDir, { recursive: true });
  const path = resolve(rawDir, `${profile}-run-${run}.jsonl`);
  for (const [index, exchange] of exchanges.entries()) {
    await appendFile(path, `${JSON.stringify({ caseId, exchange: index + 1, ...exchange })}\n`, 'utf8');
  }
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? null;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

async function executeCase(
  config: LiveConfig,
  profile: QwenLlamaCppSamplingProfile,
  run: number,
  testCase: QwenGoldenCase,
  attempts: QwenLocalLiveAttempt[],
): Promise<QwenGoldenObservation> {
  const runtime = new QwenLlamaCppRuntime({
    baseUrl: config.baseUrl,
    model: config.modelId,
    samplingProfile: profile,
  });
  const requestId = `live-${profile}-${run}-${testCase.id}`;
  const gateway = new AiGateway({
    runtime,
    retriever: syntheticRetrieverFor(testCase),
    tools: toolRegistryFor(testCase),
    timeoutMs: 120_000,
    requestId: () => requestId,
  });
  const startedAt = performance.now();
  let observation: QwenGoldenObservation;
  let gatewayError: AiGatewayError | undefined;
  let protectedFactViolationCount = 0;
  let toolCallsExecuted = 0;
  let schemaPassed = true;
  let protectedFactPolicyPassed = true;

  try {
    const result = await gateway.run({
      version: 1,
      prompt: testCase.prompt,
      locale: 'ru-RU',
      scope: 'trip',
    }, {
      accountScopeId: 'synthetic-eval-account',
      authorizedTripId: 'synthetic-eval-trip',
    });
    toolCallsExecuted = result.audit.toolCallsExecuted;
    const claims = result.answer.claims.map((claim) => {
      const evaluation = result.evaluation.find((item) => item.claimId === claim.id);
      if (claim.mode === 'fact' && PROTECTED_DOMAINS.has(claim.domain) && evaluation?.authoritative !== true) {
        protectedFactViolationCount += 1;
      }
      return {
        domain: claim.domain,
        mode: claim.mode,
        authoritative: evaluation?.authoritative === true,
      };
    });
    protectedFactPolicyPassed = protectedFactViolationCount === 0;
    observation = {
      id: testCase.id,
      outcome: 'success',
      claims,
      ...(testCase.requiresSemanticCoverage && semanticVerdict(testCase, config.semanticReview) !== undefined
        ? { semanticCoveragePassed: semanticVerdict(testCase, config.semanticReview) }
        : {}),
    };
  } catch (error) {
    if (!(error instanceof AiGatewayError)) throw error;
    gatewayError = error;
    toolCallsExecuted = error.audit?.toolCallsExecuted ?? 0;
    const localRuntimeError = runtimeErrorCode(error);
    schemaPassed = !(error.code === 'runtime_failure' && localRuntimeError === 'invalid_response');
    protectedFactPolicyPassed = error.code === 'invalid_model_output' || error.code === 'runtime_failure' || error.code === 'tool_failure';
    observation = observationFromGatewayError(testCase, error, config.semanticReview);
  }

  const elapsedMs = Math.max(0, performance.now() - startedAt);
  const exchanges = runtime.drainLocalExchanges();
  await persistRawExchanges(config.outputDir, profile, run, testCase.id, exchanges);
  attempts.push({
    caseId: testCase.id,
    samplingProfile: profile,
    run,
    outcome: observation.outcome,
    ...(gatewayError ? { errorCode: gatewayError.code } : {}),
    ...(gatewayError && runtimeErrorCode(gatewayError) ? { runtimeErrorCode: runtimeErrorCode(gatewayError) } : {}),
    schemaPassed,
    protectedFactPolicyPassed,
    protectedFactViolationCount,
    toolCallsExecuted,
    semanticCoverageVerdict: semanticLabel(testCase, config.semanticReview),
    latencyMs: roundMetric(elapsedMs),
    modelExchanges: exchanges.length,
    ...aggregateExchangeMetrics(exchanges),
  });
  return observation;
}

async function runProfile(
  config: LiveConfig,
  profile: QwenLlamaCppSamplingProfile,
  runs: number,
  attempts: QwenLocalLiveAttempt[],
): Promise<Array<{ profile: QwenLlamaCppSamplingProfile; run: number; report: QwenGoldenEvaluationReport }>> {
  const reports: Array<{ profile: QwenLlamaCppSamplingProfile; run: number; report: QwenGoldenEvaluationReport }> = [];
  for (let run = 1; run <= runs; run += 1) {
    const report = await runQwenGoldenEvaluation((testCase) => executeCase(config, profile, run, testCase, attempts));
    reports.push({ profile, run, report });
  }
  return reports;
}

function buildReport(
  config: LiveConfig,
  attempts: readonly QwenLocalLiveAttempt[],
  goldenReports: readonly { profile: QwenLlamaCppSamplingProfile; run: number; report: QwenGoldenEvaluationReport }[],
): QwenLocalLiveEvaluationReport {
  const semanticCoverage = QWEN_GOLDEN_CASES
    .filter((testCase) => testCase.requiresSemanticCoverage)
    .map((testCase) => ({
      caseId: testCase.id,
      verdict: config.semanticReview[testCase.id] === true
        ? 'pass' as const
        : config.semanticReview[testCase.id] === false
          ? 'fail' as const
          : 'not_reviewed' as const,
    }));
  const qualificationReasons: string[] = [];
  if (goldenReports.some(({ report }) => !report.passed)) qualificationReasons.push('one_or_more_golden_runs_failed');
  if (semanticCoverage.some((item) => item.verdict === 'not_reviewed')) qualificationReasons.push('semantic_review_incomplete');
  if (semanticCoverage.some((item) => item.verdict === 'fail')) qualificationReasons.push('semantic_coverage_failed');
  const protectedFactViolations = attempts.reduce((sum, item) => sum + item.protectedFactViolationCount, 0);
  if (protectedFactViolations > 0) qualificationReasons.push('protected_fact_violation');
  const latency = attempts.map((item) => item.latencyMs);
  const tps = attempts.flatMap((item) => item.predictedTokensPerSecond === undefined ? [] : [item.predictedTokensPerSecond]);
  const timeoutCount = attempts.filter((item) => item.errorCode === 'timeout' || item.runtimeErrorCode === 'timeout').length;
  if (timeoutCount > 0) qualificationReasons.push('timeout_observed');
  const errorCount = attempts.filter((item) => item.outcome === 'rejected').length;
  const toolCaseIds = new Set<QwenGoldenCaseId>([
    'tool_backed_price_can_be_authoritative',
    'stale_protected_fact_fails_closed',
    'externally_checkable_prose_has_structured_claims',
    'unknown_tool_fails_closed',
  ]);
  const toolSelection = QWEN_GOLDEN_CASES
    .filter((testCase) => toolCaseIds.has(testCase.id))
    .map((testCase) => {
      const items = attempts.filter((attempt) => attempt.caseId === testCase.id);
      return {
        caseId: testCase.id,
        attempts: items.length,
        attemptsWithExecutedTool: items.filter((item) => item.toolCallsExecuted > 0).length,
      };
    });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: qualificationReasons.length === 0 ? 'QUALIFIED' : 'NOT_QUALIFIED',
    model: {
      repo: config.modelRepo,
      revision: config.modelRevision,
      filename: config.modelFilename,
      sha256: config.modelSha256,
      quantization: config.quantization,
    },
    llamaCpp: {
      release: config.llamaCppRelease,
      commit: config.llamaCppCommit,
      observedVersion: config.llamaCppObservedVersion,
    },
    runtime: {
      adapterId: 'qwen3-8b-llamacpp-local-v1',
      adapterVersion: QWEN_LLAMACPP_ADAPTER_VERSION,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      contextSize: config.contextSize,
    },
    samplingProfiles: [
      { id: 'normal', runsPerCase: config.normalRuns },
      { id: 'reproducible', runsPerCase: config.reproducibleRuns },
    ],
    casesAttempted: QWEN_GOLDEN_CASES.map((testCase) => testCase.id),
    attempts: attempts.length,
    structuredValidationRate: attempts.length === 0 ? 0 : roundMetric(attempts.filter((item) => item.schemaPassed).length / attempts.length),
    protectedFactPolicyRate: attempts.length === 0 ? 0 : roundMetric(attempts.filter((item) => item.protectedFactPolicyPassed).length / attempts.length),
    protectedFactViolations,
    semanticCoverage,
    toolSelection,
    timeoutCount,
    errorCount,
    latencyMs: {
      min: latency.length === 0 ? null : roundMetric(Math.min(...latency)),
      p50: percentile(latency, 0.5) === null ? null : roundMetric(percentile(latency, 0.5)!),
      p95: percentile(latency, 0.95) === null ? null : roundMetric(percentile(latency, 0.95)!),
      max: latency.length === 0 ? null : roundMetric(Math.max(...latency)),
    },
    predictedTokensPerSecond: {
      samples: tps.length,
      p50: percentile(tps, 0.5) === null ? null : roundMetric(percentile(tps, 0.5)!),
    },
    goldenRuns: goldenReports.map(({ profile, run, report }) => ({
      samplingProfile: profile,
      run,
      passed: report.passed,
      missing: [...report.missing],
      failed: [...report.failed],
    })),
    qualificationReasons,
  };
}

export async function runQwenLocalLiveEvaluation(): Promise<QwenLocalLiveEvaluationReport> {
  const config = await loadConfig();
  await mkdir(config.outputDir, { recursive: true });
  const attempts: QwenLocalLiveAttempt[] = [];
  const normal = await runProfile(config, 'normal', config.normalRuns, attempts);
  const reproducible = await runProfile(config, 'reproducible', config.reproducibleRuns, attempts);
  const report = buildReport(config, attempts, [...normal, ...reproducible]);
  const reportPath = resolve(config.outputDir, `report-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    attempts: report.attempts,
    structuredValidationRate: report.structuredValidationRate,
    protectedFactViolations: report.protectedFactViolations,
    semanticCoverage: report.semanticCoverage,
    timeoutCount: report.timeoutCount,
    latencyMs: report.latencyMs,
    predictedTokensPerSecond: report.predictedTokensPerSecond,
    reportPath,
  }, null, 2));
  return report;
}

if (require.main === module) {
  runQwenLocalLiveEvaluation().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
