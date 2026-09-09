export const AI_KNOWLEDGE_CONTRACT_VERSION = 1 as const;

export const AI_FACT_DOMAINS = [
  'trip',
  'destination',
  'itinerary',
  'transport_schedule',
  'price',
  'availability',
  'map_route',
  'legal',
  'weather',
  'general',
] as const;
export type AiFactDomain = (typeof AI_FACT_DOMAINS)[number];

export const AI_TOOL_IDS = ['trip.read', 'transport.search', 'map.route', 'legal.check'] as const;
export type AiToolId = (typeof AI_TOOL_IDS)[number];

export type AiGatewayRequest = {
  version: 1;
  prompt: string;
  locale: 'ru-RU';
  scope: 'general' | 'trip';
};

export type KnowledgeSource = {
  id: string;
  title: string;
  publisher: string;
  sourceType: 'official' | 'editorial' | 'user';
  url?: string;
  retrievedAt: string;
  validUntil?: string;
};

export type KnowledgeChunk = {
  id: string;
  sourceId: string;
  domain: AiFactDomain;
  text: string;
  relevance: number;
};

export type KnowledgeRetrievalResult = {
  version: 1;
  queryId: string;
  sources: KnowledgeSource[];
  chunks: KnowledgeChunk[];
};

export type AiEvidence = {
  id: string;
  origin: 'tool' | 'knowledge';
  domain: AiFactDomain;
  text: string;
  freshness: 'current' | 'expired' | 'unknown';
  sourceType: 'official' | 'provider' | 'user' | 'editorial';
  toolId?: AiToolId;
  providerId?: string;
  sourceUrl?: string;
  retrievedAt?: string;
};

export type AiToolDescriptor = {
  id: AiToolId;
  description: string;
  allowedDomains: AiFactDomain[];
  requiresTrip: boolean;
};

export type AiToolCall = {
  id: string;
  toolId: AiToolId;
  input: Record<string, unknown>;
};

export type AiStructuredClaim = {
  id: string;
  domain: AiFactDomain;
  statement: string;
  mode: 'fact' | 'inference';
  evidenceIds: string[];
};

export type AiStructuredAnswer = {
  version: 1;
  requestId: string;
  message: string;
  claims: AiStructuredClaim[];
};

export type AiModelTurn =
  | {
      version: 1;
      requestId: string;
      kind: 'tool_calls';
      calls: AiToolCall[];
    }
  | {
      version: 1;
      requestId: string;
      kind: 'answer';
      answer: AiStructuredAnswer;
    };

export type AiClaimEvaluation = {
  claimId: string;
  authoritative: boolean;
  reason: 'tool_evidence' | 'knowledge_evidence' | 'model_inference' | 'missing_evidence' | 'stale_or_unknown' | 'wrong_tool';
};

export type AiValidationError = {
  path: string;
  code:
    | 'invalid_shape'
    | 'invalid_value'
    | 'duplicate_id'
    | 'request_mismatch'
    | 'unknown_reference'
    | 'fact_requires_evidence'
    | 'protected_fact_requires_tool_evidence'
    | 'tool_not_allowed';
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROTECTED_FACT_DOMAINS = new Set<AiFactDomain>([
  'transport_schedule',
  'price',
  'availability',
  'map_route',
  'legal',
  'weather',
]);

const REQUIRED_TOOL_BY_DOMAIN: Partial<Record<AiFactDomain, AiToolId>> = {
  transport_schedule: 'transport.search',
  price: 'transport.search',
  availability: 'transport.search',
  map_route: 'map.route',
  legal: 'legal.check',
};

export const AI_TOOL_CATALOG: readonly AiToolDescriptor[] = [
  { id: 'trip.read', description: 'Read the already-authorized Trip context.', allowedDomains: ['trip'], requiresTrip: true },
  { id: 'transport.search', description: 'Get normalized transport schedule, price and availability evidence.', allowedDomains: ['transport_schedule', 'price', 'availability'], requiresTrip: true },
  { id: 'map.route', description: 'Get normalized route-map evidence.', allowedDomains: ['map_route'], requiresTrip: true },
  { id: 'legal.check', description: 'Get normalized source-backed route-general legal evidence.', allowedDomains: ['legal'], requiresTrip: true },
] as const;

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateAiGatewayRequest(request: AiGatewayRequest): AiValidationError[] {
  const errors: AiValidationError[] = [];
  if (request.version !== AI_KNOWLEDGE_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validText(request.prompt, 4_000)) errors.push({ path: 'prompt', code: 'invalid_value' });
  if (request.locale !== 'ru-RU') errors.push({ path: 'locale', code: 'invalid_value' });
  if (!['general', 'trip'].includes(request.scope)) errors.push({ path: 'scope', code: 'invalid_value' });
  return errors;
}

export function validateKnowledgeRetrievalResult(candidate: unknown, expectedQueryId: string): AiValidationError[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [{ path: '$', code: 'invalid_shape' }];
  const result = candidate as Partial<KnowledgeRetrievalResult>;
  const errors: AiValidationError[] = [];
  if (result.version !== AI_KNOWLEDGE_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(result.queryId) || result.queryId !== expectedQueryId) errors.push({ path: 'queryId', code: 'request_mismatch' });
  if (!Array.isArray(result.sources) || result.sources.length > 64) errors.push({ path: 'sources', code: 'invalid_shape' });
  if (!Array.isArray(result.chunks) || result.chunks.length > 64) errors.push({ path: 'chunks', code: 'invalid_shape' });
  if (errors.length > 0) return errors;

  const sources = result.sources as KnowledgeSource[];
  const chunks = result.chunks as KnowledgeChunk[];
  if (new Set(sources.map((item) => item.id)).size !== sources.length) errors.push({ path: 'sources', code: 'duplicate_id' });
  if (new Set(chunks.map((item) => item.id)).size !== chunks.length) errors.push({ path: 'chunks', code: 'duplicate_id' });
  const sourceIds = new Set<string>();
  sources.forEach((source, index) => {
    if (!validId(source.id) || !validText(source.title, 240) || !validText(source.publisher, 160)) errors.push({ path: `sources[${index}]`, code: 'invalid_value' });
    if (!['official', 'editorial', 'user'].includes(source.sourceType)) errors.push({ path: `sources[${index}].sourceType`, code: 'invalid_value' });
    if (source.url !== undefined && !validHttpsUrl(source.url)) errors.push({ path: `sources[${index}].url`, code: 'invalid_value' });
    if (!validTimestamp(source.retrievedAt)) errors.push({ path: `sources[${index}].retrievedAt`, code: 'invalid_value' });
    if (source.validUntil !== undefined && !validTimestamp(source.validUntil)) errors.push({ path: `sources[${index}].validUntil`, code: 'invalid_value' });
    if (validId(source.id)) sourceIds.add(source.id);
  });
  chunks.forEach((chunk, index) => {
    if (!validId(chunk.id) || !validId(chunk.sourceId) || !sourceIds.has(chunk.sourceId)) errors.push({ path: `chunks[${index}].sourceId`, code: 'unknown_reference' });
    if (!(AI_FACT_DOMAINS as readonly string[]).includes(chunk.domain)) errors.push({ path: `chunks[${index}].domain`, code: 'invalid_value' });
    if (!validText(chunk.text, 4_000)) errors.push({ path: `chunks[${index}].text`, code: 'invalid_value' });
    if (typeof chunk.relevance !== 'number' || !Number.isFinite(chunk.relevance) || chunk.relevance < 0 || chunk.relevance > 1) errors.push({ path: `chunks[${index}].relevance`, code: 'invalid_value' });
  });
  return errors;
}

export function knowledgeResultToEvidence(result: KnowledgeRetrievalResult, now = new Date()): AiEvidence[] {
  const sourceById = new Map(result.sources.map((source) => [source.id, source]));
  return result.chunks.map((chunk) => {
    const source = sourceById.get(chunk.sourceId)!;
    const freshness: AiEvidence['freshness'] = source.validUntil === undefined
      ? 'unknown'
      : Date.parse(source.validUntil) >= now.getTime() ? 'current' : 'expired';
    return {
      id: `knowledge:${chunk.id}`,
      origin: 'knowledge',
      domain: chunk.domain,
      text: chunk.text,
      freshness,
      sourceType: source.sourceType,
      ...(source.url ? { sourceUrl: source.url } : {}),
      retrievedAt: source.retrievedAt,
    };
  });
}

export function validateAiModelTurn(candidate: unknown, expectedRequestId: string, availableTools: readonly AiToolDescriptor[]): AiValidationError[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [{ path: '$', code: 'invalid_shape' }];
  const turn = candidate as Partial<AiModelTurn>;
  const errors: AiValidationError[] = [];
  if (turn.version !== AI_KNOWLEDGE_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(turn.requestId) || turn.requestId !== expectedRequestId) errors.push({ path: 'requestId', code: 'request_mismatch' });
  if (!['tool_calls', 'answer'].includes(String(turn.kind))) errors.push({ path: 'kind', code: 'invalid_value' });
  if (errors.length > 0) return errors;

  if (turn.kind === 'tool_calls') {
    const calls = (turn as Extract<AiModelTurn, { kind: 'tool_calls' }>).calls;
    if (!Array.isArray(calls) || calls.length < 1 || calls.length > 4) return [{ path: 'calls', code: 'invalid_shape' }];
    if (new Set(calls.map((call) => call.id)).size !== calls.length) errors.push({ path: 'calls', code: 'duplicate_id' });
    const allowed = new Set(availableTools.map((tool) => tool.id));
    calls.forEach((call, index) => {
      if (!validId(call.id)) errors.push({ path: `calls[${index}].id`, code: 'invalid_value' });
      if (!(AI_TOOL_IDS as readonly string[]).includes(call.toolId) || !allowed.has(call.toolId)) errors.push({ path: `calls[${index}].toolId`, code: 'tool_not_allowed' });
      if (!isPlainRecord(call.input)) errors.push({ path: `calls[${index}].input`, code: 'invalid_shape' });
      else if (JSON.stringify(call.input).length > 8_000) errors.push({ path: `calls[${index}].input`, code: 'invalid_value' });
    });
    return errors;
  }

  const answer = (turn as Extract<AiModelTurn, { kind: 'answer' }>).answer;
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return [{ path: 'answer', code: 'invalid_shape' }];
  if (answer.version !== AI_KNOWLEDGE_CONTRACT_VERSION) errors.push({ path: 'answer.version', code: 'invalid_value' });
  if (!validId(answer.requestId) || answer.requestId !== expectedRequestId) errors.push({ path: 'answer.requestId', code: 'request_mismatch' });
  if (!validText(answer.message, 12_000)) errors.push({ path: 'answer.message', code: 'invalid_value' });
  if (!Array.isArray(answer.claims) || answer.claims.length > 128) errors.push({ path: 'answer.claims', code: 'invalid_shape' });
  return errors;
}

export function evidenceIsAuthoritativeForDomain(evidence: AiEvidence, domain: AiFactDomain): boolean {
  if (evidence.freshness !== 'current') return false;
  if (domain === 'trip') return evidence.origin === 'tool' && evidence.toolId === 'trip.read' && evidence.sourceType === 'user';
  const requiredTool = REQUIRED_TOOL_BY_DOMAIN[domain];
  if (requiredTool !== undefined) {
    if (evidence.origin !== 'tool' || evidence.toolId !== requiredTool || evidence.domain !== domain) return false;
    if (domain === 'legal') return evidence.sourceType === 'official' && evidence.sourceUrl !== undefined && validHttpsUrl(evidence.sourceUrl);
    return evidence.sourceType === 'provider' || evidence.sourceType === 'official';
  }
  if (domain === 'weather') return false;
  return evidence.origin === 'knowledge' && evidence.domain === domain && evidence.sourceType === 'official' && evidence.sourceUrl !== undefined && validHttpsUrl(evidence.sourceUrl);
}

export function validateAiStructuredAnswer(answer: AiStructuredAnswer, expectedRequestId: string, evidence: readonly AiEvidence[]): AiValidationError[] {
  const errors: AiValidationError[] = [];
  if (answer.version !== AI_KNOWLEDGE_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(answer.requestId) || answer.requestId !== expectedRequestId) errors.push({ path: 'requestId', code: 'request_mismatch' });
  if (!validText(answer.message, 12_000)) errors.push({ path: 'message', code: 'invalid_value' });
  if (!Array.isArray(answer.claims) || answer.claims.length > 128) return [...errors, { path: 'claims', code: 'invalid_shape' }];
  if (new Set(answer.claims.map((claim) => claim.id)).size !== answer.claims.length) errors.push({ path: 'claims', code: 'duplicate_id' });
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  answer.claims.forEach((claim, index) => {
    const path = `claims[${index}]`;
    if (!validId(claim.id) || !validText(claim.statement, 2_000)) errors.push({ path, code: 'invalid_value' });
    if (!(AI_FACT_DOMAINS as readonly string[]).includes(claim.domain)) errors.push({ path: `${path}.domain`, code: 'invalid_value' });
    if (!['fact', 'inference'].includes(claim.mode)) errors.push({ path: `${path}.mode`, code: 'invalid_value' });
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length > 16) {
      errors.push({ path: `${path}.evidenceIds`, code: 'invalid_shape' });
      return;
    }
    const resolved = claim.evidenceIds.map((id) => evidenceById.get(id));
    if (resolved.some((item) => item === undefined)) errors.push({ path: `${path}.evidenceIds`, code: 'unknown_reference' });
    const validEvidence = resolved.filter((item): item is AiEvidence => item !== undefined);
    if (claim.mode === 'fact' && validEvidence.length === 0) errors.push({ path: `${path}.evidenceIds`, code: 'fact_requires_evidence' });
    if (PROTECTED_FACT_DOMAINS.has(claim.domain)) {
      const backed = claim.mode === 'fact' && validEvidence.some((item) => evidenceIsAuthoritativeForDomain(item, claim.domain));
      if (!backed) errors.push({ path: `${path}.evidenceIds`, code: 'protected_fact_requires_tool_evidence' });
    }
  });
  return errors;
}

export function evaluateAiStructuredAnswer(answer: AiStructuredAnswer, evidence: readonly AiEvidence[]): AiClaimEvaluation[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return answer.claims.map((claim) => {
    if (claim.mode === 'inference') return { claimId: claim.id, authoritative: false, reason: 'model_inference' as const };
    const resolved = claim.evidenceIds.map((id) => evidenceById.get(id)).filter((item): item is AiEvidence => item !== undefined);
    if (resolved.length === 0) return { claimId: claim.id, authoritative: false, reason: 'missing_evidence' as const };
    const authoritative = resolved.some((item) => evidenceIsAuthoritativeForDomain(item, claim.domain));
    if (authoritative) {
      return { claimId: claim.id, authoritative: true, reason: resolved.some((item) => item.origin === 'tool') ? 'tool_evidence' as const : 'knowledge_evidence' as const };
    }
    if (resolved.some((item) => item.freshness !== 'current')) return { claimId: claim.id, authoritative: false, reason: 'stale_or_unknown' as const };
    return { claimId: claim.id, authoritative: false, reason: 'wrong_tool' as const };
  });
}
