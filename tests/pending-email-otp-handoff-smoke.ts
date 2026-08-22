import {
  clearPendingEmailOtpHandoff,
  loadPendingEmailOtpHandoff,
  savePendingEmailOtpHandoff,
  type PendingEmailOtpStorage,
} from '../src/auth/pendingEmailOtpHandoff';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

class MemoryStorage implements PendingEmailOtpStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  dump(): string {
    return [...this.values.values()].join('\n');
  }
}

const now = Date.parse('2026-08-22T06:40:00.000Z');
const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
const challenge = {
  id: 'a'.repeat(32),
  methodId: 'email_otp',
  kind: 'code' as const,
  maskedDestination: 'i***@example.com',
  expiresAt,
};

{
  const storage = new MemoryStorage();
  const saved = savePendingEmailOtpHandoff({
    intent: 'sign_up',
    email: 'ilsaf@example.com',
    displayName: 'Ильсаф',
    challenge,
  }, storage, now);

  assertEqual(saved, true, 'sign-up handoff must be persisted');
  const restored = loadPendingEmailOtpHandoff(storage, now + 30_000);
  assert(restored, 'sign-up handoff must restore after a reload');
  assertEqual(restored.intent, 'sign_up', 'sign-up intent must survive reload');
  assertEqual(restored.email, 'ilsaf@example.com', 'email must survive reload for resend support');
  assertEqual(restored.displayName, 'Ильсаф', 'display name must survive sign-up reload');
  assertEqual(restored.challenge.id, challenge.id, 'challenge id must survive reload');
  assertEqual(restored.challenge.expiresAt, expiresAt, 'challenge expiry must survive reload');
  assertEqual(storage.dump().includes('000000'), false, 'OTP code must never be persisted');
}

{
  const storage = new MemoryStorage();
  assertEqual(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge,
  }, storage, now), true, 'sign-in handoff must be persisted');

  const restored = loadPendingEmailOtpHandoff(storage, now + 60_000);
  assert(restored, 'sign-in handoff must restore after a reload');
  assertEqual(restored.intent, 'sign_in', 'sign-in intent must survive reload');
  assertEqual('displayName' in restored, false, 'sign-in handoff must not invent profile data');

  clearPendingEmailOtpHandoff(storage);
  assertEqual(loadPendingEmailOtpHandoff(storage, now + 60_000), null, 'explicit cleanup must remove pending handoff');
}

{
  const storage = new MemoryStorage();
  assertEqual(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge,
  }, storage, now), true, 'handoff setup must succeed');

  assertEqual(loadPendingEmailOtpHandoff(storage, Date.parse(expiresAt) + 1), null, 'expired challenge must not be restored');
  assertEqual(storage.dump(), '', 'expired challenge must be removed from browser storage');
}

{
  const storage = new MemoryStorage();
  assertEqual(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge: { ...challenge, id: 'not-a-server-challenge-id' },
  }, storage, now), false, 'malformed challenge identifiers must not be persisted');
  assertEqual(storage.dump(), '', 'invalid handoff must not write browser storage');
}

console.log('ARVELIS pending email OTP handoff smoke: PASS');
