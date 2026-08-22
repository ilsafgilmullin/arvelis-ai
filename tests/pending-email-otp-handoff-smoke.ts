import assert from 'node:assert/strict';
import {
  clearPendingEmailOtpHandoff,
  loadPendingEmailOtpHandoff,
  savePendingEmailOtpHandoff,
  type PendingEmailOtpStorage,
} from '../src/auth/pendingEmailOtpHandoff';

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

  assert.equal(saved, true);
  const restored = loadPendingEmailOtpHandoff(storage, now + 30_000);
  assert.ok(restored);
  assert.equal(restored.intent, 'sign_up');
  assert.equal(restored.email, 'ilsaf@example.com');
  assert.equal(restored.displayName, 'Ильсаф');
  assert.equal(restored.challenge.id, challenge.id);
  assert.equal(restored.challenge.expiresAt, expiresAt);
  assert.equal(storage.dump().includes('000000'), false, 'OTP code must never be persisted');
}

{
  const storage = new MemoryStorage();
  assert.equal(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge,
  }, storage, now), true);

  const restored = loadPendingEmailOtpHandoff(storage, now + 60_000);
  assert.ok(restored);
  assert.equal(restored.intent, 'sign_in');
  assert.equal('displayName' in restored, false);

  clearPendingEmailOtpHandoff(storage);
  assert.equal(loadPendingEmailOtpHandoff(storage, now + 60_000), null);
}

{
  const storage = new MemoryStorage();
  assert.equal(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge,
  }, storage, now), true);

  assert.equal(loadPendingEmailOtpHandoff(storage, Date.parse(expiresAt) + 1), null, 'expired challenge must not be restored');
  assert.equal(storage.dump(), '', 'expired challenge must be removed from browser storage');
}

{
  const storage = new MemoryStorage();
  assert.equal(savePendingEmailOtpHandoff({
    intent: 'sign_in',
    email: 'user@example.com',
    challenge: { ...challenge, id: 'not-a-server-challenge-id' },
  }, storage, now), false, 'malformed challenge identifiers must not be persisted');
  assert.equal(storage.dump(), '');
}

console.log('ARVELIS pending email OTP handoff smoke: PASS');
