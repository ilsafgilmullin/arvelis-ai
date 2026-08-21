import type {
  AuthAccount,
  AuthChallenge,
  AuthFailure,
  AuthFailureCode,
  AuthMethodDescriptor,
  AuthSession,
  AuthSessionSummary,
} from './contracts';
import { AUTH_PROTOCOL_LIMITS } from './protocolLimits';

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

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  if (typeof value !== 'string' || value.length > maxLength) return false;
  return allowEmpty || value.trim().length > 0;
}

function isOptionalBoundedString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength, true);
}

function isIsoLikeDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && Number.isFinite(Date.parse(value));
}

export function isSecureAuthorizationUrl(value: unknown): value is string {
  if (!isBoundedString(value, AUTH_PROTOCOL_LIMITS.redirectUrlLength)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isAuthMethodDescriptor(value: unknown): value is AuthMethodDescriptor {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, AUTH_PROTOCOL_LIMITS.methodIdLength)) return false;
  if (!isBoundedString(value.label, AUTH_PROTOCOL_LIMITS.labelLength) || typeof value.enabled !== 'boolean') return false;
  if (value.kind !== 'identifier' && value.kind !== 'external') return false;

  if (value.identifierType !== undefined && value.identifierType !== 'email' && value.identifierType !== 'phone') {
    return false;
  }

  if (value.kind === 'identifier' && value.identifierType === undefined) return false;
  if (value.kind !== 'identifier' && value.identifierType !== undefined) return false;

  return true;
}

export function normalizeAuthMethodCatalog(value: unknown): AuthMethodDescriptor[] {
  if (!Array.isArray(value) || value.length > AUTH_PROTOCOL_LIMITS.methods) return [];

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

  const emailValid = isOptionalBoundedString(value.primaryEmail, AUTH_PROTOCOL_LIMITS.emailLength);
  const phoneValid = isOptionalBoundedString(value.primaryPhone, AUTH_PROTOCOL_LIMITS.phoneLength);
  if (!emailValid || !phoneValid) return false;
  if (typeof value.emailVerified !== 'boolean' || typeof value.phoneVerified !== 'boolean') return false;
  if (value.emailVerified && !isBoundedString(value.primaryEmail, AUTH_PROTOCOL_LIMITS.emailLength)) return false;
  if (value.phoneVerified && !isBoundedString(value.primaryPhone, AUTH_PROTOCOL_LIMITS.phoneLength)) return false;

  return isBoundedString(value.id, AUTH_PROTOCOL_LIMITS.idLength)
    && isBoundedString(value.displayName, AUTH_PROTOCOL_LIMITS.displayNameLength, true);
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value)) return false;

  return isBoundedString(value.id, AUTH_PROTOCOL_LIMITS.idLength)
    && isAuthAccount(value.account)
    && isIsoLikeDate(value.createdAt)
    && isIsoLikeDate(value.expiresAt);
}

export function isAuthSessionSummary(value: unknown): value is AuthSessionSummary {
  if (!isRecord(value)) return false;

  return isBoundedString(value.id, AUTH_PROTOCOL_LIMITS.idLength)
    && typeof value.current === 'boolean'
    && isIsoLikeDate(value.createdAt)
    && isIsoLikeDate(value.expiresAt)
    && (value.lastSeenAt === undefined || isIsoLikeDate(value.lastSeenAt))
    && isOptionalBoundedString(value.deviceLabel, AUTH_PROTOCOL_LIMITS.deviceLabelLength)
    && isOptionalBoundedString(value.browserLabel, AUTH_PROTOCOL_LIMITS.browserLabelLength);
}

export function normalizeAuthSessionSummaries(value: unknown): AuthSessionSummary[] {
  if (!Array.isArray(value) || value.length > AUTH_PROTOCOL_LIMITS.sessions) return [];

  const seenIds = new Set<string>();
  const sessions: AuthSessionSummary[] = [];

  for (const candidate of value) {
    if (!isAuthSessionSummary(candidate) || seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    sessions.push(candidate);
  }

  if (sessions.filter((session) => session.current).length > 1) return [];
  return sessions;
}

export function isAuthChallenge(value: unknown): value is AuthChallenge {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, AUTH_PROTOCOL_LIMITS.idLength)) return false;
  if (!isBoundedString(value.methodId, AUTH_PROTOCOL_LIMITS.methodIdLength)) return false;
  if (value.kind !== 'code' && value.kind !== 'external_redirect') return false;
  if (!isOptionalBoundedString(value.maskedDestination, AUTH_PROTOCOL_LIMITS.maskedDestinationLength)) return false;
  if (!isOptionalBoundedString(value.redirectUrl, AUTH_PROTOCOL_LIMITS.redirectUrlLength)) return false;
  if (value.expiresAt !== undefined && !isIsoLikeDate(value.expiresAt)) return false;
  if (value.kind === 'external_redirect' && !isSecureAuthorizationUrl(value.redirectUrl)) return false;

  return true;
}

export function isAuthFailure(value: unknown): value is AuthFailure {
  if (!isRecord(value)) return false;
  if (typeof value.code !== 'string' || !failureCodes.has(value.code as AuthFailureCode)) return false;
  if (!isBoundedString(value.message, AUTH_PROTOCOL_LIMITS.failureMessageLength, true)) return false;

  return value.retryAfterSeconds === undefined
    || (typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds) && value.retryAfterSeconds >= 0);
}
