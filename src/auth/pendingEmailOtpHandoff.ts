import type { AuthCodeChallenge, AuthIntent } from './contracts';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from './previewProfile';

const STORAGE_KEY = 'arvelis.auth.pending-email-otp.v1';
const EMAIL_MAX_LENGTH = 254;
const CHALLENGE_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_MASKED_DESTINATION_LENGTH = 320;

export type PendingEmailOtpHandoff = {
  intent: AuthIntent;
  email: string;
  displayName?: string;
  challenge: AuthCodeChallenge;
  savedAt: number;
};

export type PendingEmailOtpStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(): PendingEmailOtpStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= EMAIL_MAX_LENGTH
    && value.trim() === value;
}

function validIntent(value: unknown): value is AuthIntent {
  return value === 'sign_in' || value === 'sign_up';
}

function validOptionalMaskedDestination(value: unknown): value is string | undefined {
  return value === undefined
    || (typeof value === 'string' && value.length > 0 && value.length <= MAX_MASKED_DESTINATION_LENGTH);
}

function normalizeChallenge(value: unknown, now: number): AuthCodeChallenge | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'code'
    || candidate.methodId !== 'email_otp'
    || typeof candidate.id !== 'string'
    || !CHALLENGE_ID_PATTERN.test(candidate.id)
    || typeof candidate.expiresAt !== 'string'
    || !validOptionalMaskedDestination(candidate.maskedDestination)) {
    return null;
  }

  const expiresAtMs = Date.parse(candidate.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return null;

  return {
    id: candidate.id,
    methodId: 'email_otp',
    kind: 'code',
    expiresAt: candidate.expiresAt,
    ...(candidate.maskedDestination === undefined ? {} : { maskedDestination: candidate.maskedDestination }),
  };
}

function normalizeStored(value: unknown, now: number): PendingEmailOtpHandoff | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!validIntent(candidate.intent) || !validEmail(candidate.email)) return null;
  if (!Number.isFinite(candidate.savedAt) || typeof candidate.savedAt !== 'number' || candidate.savedAt > now + 60_000) return null;

  const challenge = normalizeChallenge(candidate.challenge, now);
  if (!challenge) return null;

  if (candidate.intent === 'sign_up') {
    if (typeof candidate.displayName !== 'string'
      || candidate.displayName.length > PREVIEW_PROFILE_NAME_MAX_LENGTH
      || validatePreviewProfileName(candidate.displayName) !== null) {
      return null;
    }

    return {
      intent: candidate.intent,
      email: candidate.email,
      displayName: normalizePreviewProfileName(candidate.displayName),
      challenge,
      savedAt: candidate.savedAt,
    };
  }

  return {
    intent: candidate.intent,
    email: candidate.email,
    challenge,
    savedAt: candidate.savedAt,
  };
}

export function savePendingEmailOtpHandoff(
  handoff: Omit<PendingEmailOtpHandoff, 'savedAt'>,
  storage: PendingEmailOtpStorage | null = browserStorage(),
  now = Date.now(),
): boolean {
  if (!storage) return false;

  const normalized = normalizeStored({ ...handoff, savedAt: now }, now);
  if (!normalized) return false;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingEmailOtpHandoff(
  storage: PendingEmailOtpStorage | null = browserStorage(),
  now = Date.now(),
): PendingEmailOtpHandoff | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const normalized = normalizeStored(JSON.parse(raw) as unknown, now);
    if (normalized) return normalized;
  } catch {
    // Invalid browser state is removed below.
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
  return null;
}

export function clearPendingEmailOtpHandoff(
  storage: PendingEmailOtpStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}
