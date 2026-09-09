import type { Trip } from './domain';

export const LEGAL_CONTRACT_VERSION = 1 as const;

export type LegalRequirementCategory =
  | 'entry'
  | 'visa'
  | 'passport'
  | 'transit'
  | 'insurance'
  | 'registration'
  | 'customs'
  | 'health'
  | 'other';

export type LegalCheckRequest = {
  version: 1;
  tripId: string;
  tripRevision: string;
  origin: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  scope: 'route_general';
};

export type LegalSourceReference = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: 'official' | 'secondary';
  retrievedAt: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
};

export type LegalClaim = {
  id: string;
  category: LegalRequirementCategory;
  summary: string;
  sourceIds: string[];
  status: 'verified' | 'needs_review';
};

export type LegalCheckResponse = {
  version: 1;
  providerId: string;
  requestId: string;
  retrievedAt: string;
  sources: LegalSourceReference[];
  claims: LegalClaim[];
};

export type LegalValidationError = {
  path: string;
  code:
    | 'invalid_shape'
    | 'invalid_value'
    | 'duplicate_id'
    | 'provider_mismatch'
    | 'request_mismatch'
    | 'missing_source'
    | 'non_official_verified_source';
};

export type LegalClaimPolicy = {
  claimId: string;
  freshness: 'current' | 'expired' | 'unknown';
  authoritative: boolean;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validDateOnly(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function createLegalCheckRequest(trip: Trip): LegalCheckRequest {
  if (!validId(trip.id) || !validText(trip.origin, 160) || !trip.destination || !validText(trip.destination, 160)) {
    throw new Error('Legal V1 requires a valid trip with explicit origin and destination.');
  }
  return {
    version: LEGAL_CONTRACT_VERSION,
    tripId: trip.id,
    tripRevision: trip.updatedAt,
    origin: trip.origin,
    destination: trip.destination,
    ...(trip.startDate ? { startDate: trip.startDate } : {}),
    ...(trip.endDate ? { endDate: trip.endDate } : {}),
    scope: 'route_general',
  };
}

export function validateLegalCheckResponse(
  candidate: unknown,
  expectedProviderId: string,
  expectedRequestId: string,
): LegalValidationError[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [{ path: '$', code: 'invalid_shape' }];
  const response = candidate as Partial<LegalCheckResponse>;
  const errors: LegalValidationError[] = [];
  if (response.version !== LEGAL_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(response.providerId)) errors.push({ path: 'providerId', code: 'invalid_value' });
  else if (response.providerId !== expectedProviderId) errors.push({ path: 'providerId', code: 'provider_mismatch' });
  if (!validId(response.requestId)) errors.push({ path: 'requestId', code: 'invalid_value' });
  else if (response.requestId !== expectedRequestId) errors.push({ path: 'requestId', code: 'request_mismatch' });
  if (!validTimestamp(response.retrievedAt)) errors.push({ path: 'retrievedAt', code: 'invalid_value' });
  if (!Array.isArray(response.sources) || response.sources.length > 64) errors.push({ path: 'sources', code: 'invalid_shape' });
  if (!Array.isArray(response.claims) || response.claims.length > 128) errors.push({ path: 'claims', code: 'invalid_shape' });
  if (errors.length > 0) return errors;

  const sources = response.sources as LegalSourceReference[];
  const claims = response.claims as LegalClaim[];
  if (new Set(sources.map((source) => source.id)).size !== sources.length) errors.push({ path: 'sources', code: 'duplicate_id' });
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) errors.push({ path: 'claims', code: 'duplicate_id' });

  const sourceById = new Map<string, LegalSourceReference>();
  for (const [index, source] of sources.entries()) {
    const prefix = `sources[${index}]`;
    if (!validId(source.id) || !validText(source.title, 240) || !validText(source.publisher, 160) || !validHttpsUrl(source.url)) {
      errors.push({ path: prefix, code: 'invalid_value' });
      continue;
    }
    if (!['official', 'secondary'].includes(source.sourceType)) errors.push({ path: `${prefix}.sourceType`, code: 'invalid_value' });
    if (!validTimestamp(source.retrievedAt)) errors.push({ path: `${prefix}.retrievedAt`, code: 'invalid_value' });
    if (source.effectiveFrom !== undefined && !validDateOnly(source.effectiveFrom)) errors.push({ path: `${prefix}.effectiveFrom`, code: 'invalid_value' });
    if (source.effectiveUntil !== undefined && !validDateOnly(source.effectiveUntil)) errors.push({ path: `${prefix}.effectiveUntil`, code: 'invalid_value' });
    sourceById.set(source.id, source);
  }

  for (const [index, claim] of claims.entries()) {
    const prefix = `claims[${index}]`;
    if (!validId(claim.id) || !validText(claim.summary, 800)) errors.push({ path: prefix, code: 'invalid_value' });
    if (!['entry', 'visa', 'passport', 'transit', 'insurance', 'registration', 'customs', 'health', 'other'].includes(claim.category)) {
      errors.push({ path: `${prefix}.category`, code: 'invalid_value' });
    }
    if (!['verified', 'needs_review'].includes(claim.status)) errors.push({ path: `${prefix}.status`, code: 'invalid_value' });
    if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length === 0 || claim.sourceIds.length > 8) {
      errors.push({ path: `${prefix}.sourceIds`, code: 'missing_source' });
      continue;
    }
    for (const sourceId of claim.sourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) errors.push({ path: `${prefix}.sourceIds`, code: 'missing_source' });
      else if (claim.status === 'verified' && source.sourceType !== 'official') {
        errors.push({ path: `${prefix}.sourceIds`, code: 'non_official_verified_source' });
      }
    }
  }
  return errors;
}

export function evaluateLegalClaimPolicies(response: LegalCheckResponse, now = new Date()): LegalClaimPolicy[] {
  const sourceById = new Map(response.sources.map((source) => [source.id, source]));
  const today = now.toISOString().slice(0, 10);
  return response.claims.map((claim) => {
    const sources = claim.sourceIds.map((id) => sourceById.get(id)).filter((source): source is LegalSourceReference => Boolean(source));
    const freshness: LegalClaimPolicy['freshness'] = sources.some((source) => source.effectiveUntil && source.effectiveUntil < today)
      ? 'expired'
      : sources.length > 0 && sources.every((source) => source.effectiveUntil !== undefined)
        ? 'current'
        : 'unknown';
    const authoritative = claim.status === 'verified'
      && freshness === 'current'
      && sources.length > 0
      && sources.every((source) => source.sourceType === 'official' && validHttpsUrl(source.url));
    return { claimId: claim.id, freshness, authoritative };
  });
}
