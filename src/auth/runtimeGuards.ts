import type {
  AuthAccount,
  AuthChallenge,
  AuthFailure,
  AuthFailureCode,
  AuthMethodDescriptor,
  AuthSession,
  AuthSessionSummary,
} from './contracts';

type UnknownRecord = Record<string, unknown>;

const failureCodes = new Set<AuthFailureCode>([
  'invalid_input',
  'invalid_challenge',
  'challenge_expired',
  'rate_limited',
  'account_locked',
  'network_error',
  'service_unavailable',
  'access_denied',
  'unknown',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isIsoLikeDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function isSecureAuthorizationUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isAuthMethodDescriptor(value: unknown): value is AuthMethodDescriptor {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.label) || typeof value.enabled !== 'boolean') return false;
  if (value.kind !== 'identifier' && value.kind !== 'external' && value.kind !== 'passkey') return false;

  if (value.identifierType !== undefined && value.identifierType !== 'email' && value.identifierType !== 'phone') {
    return false;
  }

  if (value.kind === 'identifier' && value.identifierType === undefined) return false;
  if (value.kind !== 'identifier' && value.identifierType !== undefined) return false;

  return true;
}

export function normalizeAuthMethodCatalog(value: unknown): AuthMethodDescriptor[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const methods: AuthMethodDescriptor[] = [];

  for (const candidate of value) {
    if (!isAuthMethodDescriptor(candidate) || !candidate.enabled || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    methods.push(candidate);
  }

  return methods;
}

export function isAuthAccount(value: unknown): value is AuthAccount {
  if (!isRecord(value)) return false;

  return isNonEmptyString(value.id)
    && typeof value.displayName === 'string'
    && isOptionalString(value.primaryEmail)
    && isOptionalString(value.primaryPhone)
    && typeof value.emailVerified === 'boolean'
    && typeof value.phoneVerified === 'boolean';
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;

  return isNonEmptyString(value.id)
    && isAuthAccount(value.account)
    && isIsoLikeDate(value.createdAt)
    && isIsoLikeDate(value.expiresAt);
}

export function isAuthSessionSummary(value: unknown): value is AuthSessionSummary {
  if (!isRecord(value)) return false;

  return isNonEmptyString(value.id)
    && typeof value.current === 'boolean'
    && isIsoLikeDate(value.createdAt)
    && isIsoLikeDate(value.expiresAt)
    && (value.lastSeenAt === undefined || isIsoLikeDate(value.lastSeenAt))
    && isOptionalString(value.deviceLabel)
    && isOptionalString(value.browserLabel);
}

export function normalizeAuthSessionSummaries(value: unknown): AuthSessionSummary[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const sessions: AuthSessionSummary[] = [];

  for (const candidate of value) {
    if (!isAuthSessionSummary(candidate) || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    sessions.push(candidate);
  }

  return sessions;
}

export function isAuthChallenge(value: unknown): value is AuthChallenge {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.methodId)) return false;
  if (value.kind !== 'code' && value.kind !== 'external_redirect' && value.kind !== 'passkey') return false;
  if (!isOptionalString(value.maskedDestination) || !isOptionalString(value.redirectUrl)) return false;
  if (value.expiresAt !== undefined && !isIsoLikeDate(value.expiresAt)) return false;
  if (value.kind === 'external_redirect' && !isSecureAuthorizationUrl(value.redirectUrl)) return false;

  return true;
}

export function isAuthFailure(value: unknown): value is AuthFailure {
  if (!isRecord(value)) return false;
  if (typeof value.code !== 'string' || !failureCodes.has(value.code as AuthFailureCode)) return false;
  if (typeof value.message !== 'string') return false;

  return value.retryAfterSeconds === undefined
    || (typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds) && value.retryAfterSeconds >= 0);
}
