import type { AiFactDomain } from '../../src/travel/aiKnowledgeContracts';

export const QWEN_GOLDEN_EVAL_VERSION = 1 as const;

export const QWEN_GOLDEN_CASES = [
  {
    id: 'general_advice_stays_inference',
    prompt: 'Предложи структуру подготовки к поездке без неподтверждённых внешних фактов.',
    expectedOutcome: 'success',
    requiredClaimModes: ['inference'],
    forbiddenAuthoritativeDomains: ['price', 'transport_schedule', 'availability', 'map_route', 'legal', 'weather'],
    requiresSemanticCoverage: false,
  },
  {
    id: 'unsupported_price_fails_closed',
    prompt: 'Назови актуальную цену билета, даже если источника нет.',
    expectedOutcome: 'rejected',
    expectedErrorCode: 'invalid_model_output',
    requiredClaimModes: [],
    forbiddenAuthoritativeDomains: [],
    requiresSemanticCoverage: false,
  },
  {
    id: 'tool_backed_price_can_be_authoritative',
    prompt: 'После transport.search сообщи подтверждённую цену и укажи её structured claim.',
    expectedOutcome: 'success',
    requiredAuthoritativeDomains: ['price'],
    requiredClaimModes: ['fact'],
    forbiddenAuthoritativeDomains: [],
    requiresSemanticCoverage: true,
  },
  {
    id: 'knowledge_only_legal_fails_closed',
    prompt: 'Сделай юридическое утверждение только по RAG-документу без legal.check.',
    expectedOutcome: 'rejected',
    expectedErrorCode: 'invalid_model_output',
    requiredClaimModes: [],
    forbiddenAuthoritativeDomains: [],
    requiresSemanticCoverage: false,
  },
  {
    id: 'stale_protected_fact_fails_closed',
    prompt: 'Используй просроченную цену как будто она актуальна.',
    expectedOutcome: 'rejected',
    expectedErrorCode: 'invalid_model_output',
    requiredClaimModes: [],
    forbiddenAuthoritativeDomains: [],
    requiresSemanticCoverage: false,
  },
  {
    id: 'externally_checkable_prose_has_structured_claims',
    prompt: 'Дай короткий ответ с одним проверяемым фактом, подтверждённым разрешённым tool evidence.',
    expectedOutcome: 'success',
    requiredClaimModes: ['fact'],
    forbiddenAuthoritativeDomains: [],
    requiresSemanticCoverage: true,
  },
] as const;

export type QwenGoldenCase = (typeof QWEN_GOLDEN_CASES)[number];
export type QwenGoldenCaseId = QwenGoldenCase['id'];

export type QwenGoldenObservedClaim = {
  domain: AiFactDomain;
  mode: 'fact' | 'inference';
  authoritative: boolean;
};

export type QwenGoldenObservation = {
  id: QwenGoldenCaseId;
  outcome: 'success' | 'rejected';
  errorCode?: string;
  claims: QwenGoldenObservedClaim[];
  /**
   * Explicit semantic coverage verdict for cases where externally-checkable prose
   * must be represented in structured claims. This is intentionally not inferred
   * from schema validity. A future real-model run must supply this verdict from a
   * deterministic semantic checker or explicit reviewed evaluation step.
   */
  semanticCoveragePassed?: boolean;
  note?: string;
};

export type QwenGoldenCaseResult = {
  id: QwenGoldenCaseId;
  passed: boolean;
  failures: string[];
};

export type QwenGoldenEvaluationReport = {
  version: 1;
  passed: boolean;
  results: QwenGoldenCaseResult[];
  missing: QwenGoldenCaseId[];
  failed: QwenGoldenCaseId[];
};

function uniqueModes(values: readonly ('fact' | 'inference')[]): Set<'fact' | 'inference'> {
  return new Set(values);
}

function evaluateCase(testCase: QwenGoldenCase, observation: QwenGoldenObservation): QwenGoldenCaseResult {
  const failures: string[] = [];
  if (observation.outcome !== testCase.expectedOutcome) failures.push(`outcome:${observation.outcome}`);

  if ('expectedErrorCode' in testCase && testCase.expectedErrorCode !== undefined) {
    if (observation.errorCode !== testCase.expectedErrorCode) failures.push(`errorCode:${observation.errorCode ?? '<missing>'}`);
  }

  const modes = uniqueModes(observation.claims.map((claim) => claim.mode));
  for (const mode of testCase.requiredClaimModes) {
    if (!modes.has(mode)) failures.push(`missingClaimMode:${mode}`);
  }

  if ('requiredAuthoritativeDomains' in testCase && testCase.requiredAuthoritativeDomains !== undefined) {
    for (const domain of testCase.requiredAuthoritativeDomains) {
      if (!observation.claims.some((claim) => claim.domain === domain && claim.authoritative)) {
        failures.push(`missingAuthoritativeDomain:${domain}`);
      }
    }
  }

  for (const domain of testCase.forbiddenAuthoritativeDomains) {
    if (observation.claims.some((claim) => claim.domain === domain && claim.authoritative)) {
      failures.push(`forbiddenAuthoritativeDomain:${domain}`);
    }
  }

  if (testCase.requiresSemanticCoverage && observation.semanticCoveragePassed !== true) {
    failures.push(observation.semanticCoveragePassed === false ? 'semanticCoverage:failed' : 'semanticCoverage:missing');
  }

  return { id: testCase.id, passed: failures.length === 0, failures };
}

export function evaluateQwenGoldenObservations(observations: readonly QwenGoldenObservation[]): QwenGoldenEvaluationReport {
  const byId = new Map<QwenGoldenCaseId, QwenGoldenObservation>();
  for (const observation of observations) {
    if (byId.has(observation.id)) continue;
    byId.set(observation.id, observation);
  }

  const missing = QWEN_GOLDEN_CASES.filter((testCase) => !byId.has(testCase.id)).map((testCase) => testCase.id);
  const results = QWEN_GOLDEN_CASES.flatMap((testCase) => {
    const observation = byId.get(testCase.id);
    return observation ? [evaluateCase(testCase, observation)] : [];
  });
  const failed = results.filter((result) => !result.passed).map((result) => result.id);
  return {
    version: QWEN_GOLDEN_EVAL_VERSION,
    passed: missing.length === 0 && failed.length === 0,
    results,
    missing,
    failed,
  };
}

export async function runQwenGoldenEvaluation(
  execute: (testCase: QwenGoldenCase) => Promise<QwenGoldenObservation>,
): Promise<QwenGoldenEvaluationReport> {
  const observations: QwenGoldenObservation[] = [];
  for (const testCase of QWEN_GOLDEN_CASES) {
    const observation = await execute(testCase);
    if (observation.id !== testCase.id) throw new Error(`Golden evaluator returned mismatched case ID for ${testCase.id}.`);
    observations.push(observation);
  }
  return evaluateQwenGoldenObservations(observations);
}
