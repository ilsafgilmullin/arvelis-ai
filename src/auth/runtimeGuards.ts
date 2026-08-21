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
import { containsUnsafeProtocolCharacters } from './protocolText';

type UnknownRecord = Record<string, unknown>;

const failureCodes = new Set<AuthFailureCode>([
  'invalid_input',
  'invalid_challenge',
  'challenge_expired',
  'rate_limited',
  'account_exists',
  'account_not_found',
  'account_locked',
  'network_error',
  'service_unavailable',
  'access_denied',
  'unknown',
]);

const METHOD_KEYS = new Set(['id', 'kind', 'label', 'enabled', 'identifierType']);
const ACCOUNT_KEYS = new Set(['id', 'displayName', 'primaryEmail', 'primaryPhone', 'emailVerified', 'phoneVerified']);
const SESSION_KEYS = new Set(['id', 'account', 'createdAt', 'expiresAt']);
const SESSION_SUMMARY_KEYS = new Set(['id', 'current', 'createdAt', 'lastSeenAt', 'expiresAt', 'deviceLabel', 'browserLabel']);
const CODE_CHALLENGE_KEYS = new Set(['id', 'methodId', 'kind', 'maskedDestination', 'expiresAt']);
const EXTERNAL_CHALLENGE_KEYS = new Set(['id', 'methodId', 'kind', 'redirectUrl', 'expiresAt']);
const FAILURE_KEYS = new Set(['code', 'message', 'retryAfterSeconds']);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: UnknownRecord, allowedKeys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = false): value is string {
  if (typeof value !== 'string' || value.length > maxLength || containsUnsafeProtocolCharacters(value)) return false;
  return allowEmpty || value.trim().length > 0;
}

function isCanonicalProtocolId(value: unknown, maxLength: number): value is string {
  return isBoundedString(value, maxLength) && value.trim() === value;
}

function isOptionalNonEmptyBoundedString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 64
    || containsUnsafeProtocolCharacters(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isIsoLikeDate(value: unknown): value is string {
  return parseTimestamp(value) !== null;
}

function isForwardTimeWindow(createdAt: unknown, expiresAt: unknown): boolean {
  const created = parseTimestamp(createdAt);
  const expires = parseTimestamp(expiresAt);
  return created !== null && expires !== null && expires > created;
}

function isTimestampInsideWindow(value: unknown, createdAt: unknown, expiresAt: unknown): boolean {
  const timestamp = parseTimestamp(value);
  const created = parseTimestamp(createdAt);
  const expires = parseTimestamp(expiresAt);
  return timestamp !== null && created !== null && expires !== null && timestamp >= created && timestamp <= expires;
}

export function isSecureAuthorizationUrl(value: unknown): value is string {
  if (!isBoundedString(value, AUTH_PROTOCOL_LIMITS.redirectUrlLength)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && !url.hash;
  } catch {
    return false;
  }
}

export function isAuthMethodDescriptor(value: unknown): value is AuthMethodDescriptor {
  if (!isRecord(value) || !hasOnlyKeys(value, METHOD_KEYS)) return false;
  if (!isCanonicalProtocolId(value.id, AUTH_PROTOCOL_LIMITS.methodIdLength)) return false;
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
  if (!isRecord(value) || !hasOnlyKeys(value, ACCOUNT_KEYS)) return false;

  const emailValid = isOptionalNonEmptyBoundedString(value.primaryEmail, AUTH_PROTOCOL_LIMITS.emailLength);
  const phoneValid = isOptionalNonEmptyBoundedString(value.primaryPhone, AUTH_PROTOCOL_LIMITS.phoneLength);
  if (!emailValid || !phoneValid) return false;
  if (typeof value.emailVerified !== 'boolean' || typeof value.phoneVerified !== 'boolean') return false;
  if (value.emailVerified && !isBoundedString(value.primaryEmail, AUTH_PROTOCOL_LIMITS.emailLength)) return false;
  if (value.phoneVerified && !isBoundedString(value.primaryPhone, AUTH_PROTOCOL_LIMITS.phoneLength)) return false;

  return isCanonicalProtocolId(value.id, AUTH_PROTOCOL_LIMITS.idLength)
    && isBoundedString(value.displayName, AUTH_PROTOCOL_LIMITS.displayNameLength);
}

export function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !hasOnlyKeys(value, SESSION_KEYS)) return false;

  return isCanonicalProtocolId(value.id, AUTH_PROTOCOL_LIMITS.idLength)
    && isAuthAccount(value.account)
    && isForwardTimeWindow(value.createdAt, value.expiresAt);
}

export function isAuthSessionSummary(value: unknown): value is AuthSessionSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, SESSION_SUMMARY_KEYS)) return false;
  if (!isCanonicalProtocolId(value.id, AUTH_PROTOCOL_LIMITS.idLength)) return false;
  if (typeof value.current !== 'boolean') return false;
  if (!isForwardTimeWindow(value.createdAt, value.expiresAt)) return false;
  if (value.lastSeenAt !== undefined && !isTimestampInsideWindow(value.lastSeenAt, value.createdAt, value.expiresAt)) return false;
  if (!isOptionalNonEmptyBoundedString(value.deviceLabel, AUTH_PROTOCOL_LIMITS.deviceLabelLength)) return false;
  if (!isOptionalNonEmptyBoundedString(value.browserLabel, AUTH_PROTOCOL_LIMITS.browserLabelLength)) return false;

  return true;
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
  if (!isCanonicalProtocolId(value.id, AUTH_PROTOCOL_LIMITS.idLength)) return false;
  if (!isCanonicalProtocolId(value.methodId, AUTH_PROTOCOL_LIMITS.methodIdLength)) return false;
  if (value.expiresAt !== undefined && !isIsoLikeDate(value.expiresAt)) return false;

  if (value.kind === 'code') {
    return hasOnlyKeys(value, CODE_CHALLENGE_KEYS)
      && isOptionalNonEmptyBoundedString(value.maskedDestination, AUTH_PROTOCOL_LIMITS.maskedDestinationLength);
  }

  if (value.kind === 'external_redirect') {
    return hasOnlyKeys(value, EXTERNAL_CHALLENGE_KEYS)
      && isSecureAuthorizationUrl(value.redirectUrl);
  }

  return false;
}

export function isAuthFailure(value: unknown): value is AuthFailure {
  if (!isRecord(value) || !hasOnlyKeys(value, FAILURE_KEYS)) return false;
  if (typeof value.code !== 'string' || !failureCodes.has(value.code as AuthFailureCode)) return false;
  if (!isBoundedString(value.message, AUTH_PROTOCOL_LIMITS.failureMessageLength, true)) return false;

  return value.retryAfterSeconds === undefined
    || (
      typeof value.retryAfterSeconds === 'number'
      && Number.isFinite(value.retryAfterSeconds)
      && value.retryAfterSeconds >= 0
      && value.retryAfterSeconds <= AUTH_PROTOCOL_LIMITS.retryAfterSeconds
    );
}
