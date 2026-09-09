export const AI_FOUNDATION_CRITICAL_EVAL_IDS = [
  'runtime_not_connected_is_truthful',
  'server_account_scope_not_exposed_to_model',
  'unknown_tool_is_rejected',
  'unsupported_price_fact_is_rejected',
  'unsupported_schedule_fact_is_rejected',
  'unsupported_availability_fact_is_rejected',
  'knowledge_only_legal_fact_is_rejected',
  'unsupported_weather_fact_is_rejected',
  'legal_fact_requires_official_current_tool_evidence',
  'expired_or_unknown_evidence_is_non_authoritative',
  'tool_evidence_is_server_stamped',
  'retrieval_output_is_untrusted_and_validated',
  'caller_cancellation_is_honored',
  'gateway_timeout_is_bounded',
  'externally_checkable_prose_is_declared_as_structured_claims',
] as const;

export type AiFoundationCriticalEvalId = (typeof AI_FOUNDATION_CRITICAL_EVAL_IDS)[number];

export type AiEvaluationCaseResult = {
  id: AiFoundationCriticalEvalId;
  passed: boolean;
  note?: string;
};

export type AiEvaluationGateResult = {
  passed: boolean;
  missing: AiFoundationCriticalEvalId[];
  failed: AiFoundationCriticalEvalId[];
};

export function evaluateAiFoundationReleaseGate(results: readonly AiEvaluationCaseResult[]): AiEvaluationGateResult {
  const byId = new Map(results.map((result) => [result.id, result]));
  const missing = AI_FOUNDATION_CRITICAL_EVAL_IDS.filter((id) => !byId.has(id));
  const failed = AI_FOUNDATION_CRITICAL_EVAL_IDS.filter((id) => byId.get(id)?.passed === false);
  return { passed: missing.length === 0 && failed.length === 0, missing: [...missing], failed: [...failed] };
}
