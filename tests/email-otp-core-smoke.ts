import type {
  EmailOtpAttemptResult,
  EmailOtpChallengeRecord,
  EmailOtpChallengeStore,
  EmailOtpDelivery,
  EmailOtpDeliveryPort,
  EmailOtpRateLimitDecision,
  EmailOtpRateLimitPort,
  EmailOtpRateLimitRequest,
  EmailOtpRateLimitScope,
} from '../server/auth/emailOtp/contracts';
import { normalizeEmailOtpAddress } from '../server/auth/emailOtp/emailAddress';
import { EMAIL_OTP_POLICY_CANDIDATE } from '../server/auth/emailOtp/policy';
import { EmailOtpService } from '../server/auth/emailOtp/service';
import { WebCryptoEmailOtpSecurity } from '../server/auth/emailOtp/webCryptoSecurity';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function cloneRecord(record: EmailOtpChallengeRecord): EmailOtpChallengeRecord {
  return { ...record };
}

class MemoryChallengeStore implements EmailOtpChallengeStore {
  readonly records = new Map<string, EmailOtpChallengeRecord>();

  async createReplacingActive(record: EmailOtpChallengeRecord): Promise<void> {
    for (const [id, current] of this.records) {
      if (
        current.email === record.email
        && current.intent === record.intent
        && current.consumedAt === null
        && current.supersededAt === null
      ) {
        this.records.set(id, { ...current, supersededAt: record.createdAt });
      }
    }
    this.records.set(record.id, cloneRecord(record));
  }

  async delete(challengeId: string): Promise<void> {
    this.records.delete(challengeId);
  }

  async beginAttempt(challengeId: string, now: number): Promise<EmailOtpAttemptResult> {
    const current = this.records.get(challengeId);
    if (!current) return { status: 'missing' };
    if (current.consumedAt !== null) return { status: 'consumed' };
    if (current.supersededAt !== null) return { status: 'superseded' };
    if (now >= current.expiresAt) return { status: 'expired' };
    if (current.attempts >= current.maxAttempts) return { status: 'locked' };

    const next = { ...current, attempts: current.attempts + 1 };
    this.records.set(challengeId, next);
    return { status: 'ready', record: cloneRecord(next), attemptNumber: next.attempts };
  }

  async consume(challengeId: string, expectedAttemptNumber: number, consumedAt: number): Promise<boolean> {
    const current = this.records.get(challengeId);
    if (!current
      || current.consumedAt !== null
      || current.supersededAt !== null
      || current.attempts !== expectedAttemptNumber
      || consumedAt >= current.expiresAt) {
      return false;
    }

    this.records.set(challengeId, { ...current, consumedAt });
    return true;
  }
}

class MemoryDelivery implements EmailOtpDeliveryPort {
  readonly deliveries: EmailOtpDelivery[] = [];
  failNext = false;

  async sendCode(delivery: EmailOtpDelivery): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated delivery failure');
    }
    this.deliveries.push({ ...delivery });
  }
}

class MemoryRateLimit implements EmailOtpRateLimitPort {
  readonly calls: EmailOtpRateLimitRequest[] = [];
  denyScope: EmailOtpRateLimitScope | null = null;

  async consume(request: EmailOtpRateLimitRequest): Promise<EmailOtpRateLimitDecision> {
    this.calls.push({ ...request });
    if (this.denyScope === request.scope) {
      return { allowed: false, retryAfterSeconds: 37 };
    }
    return { allowed: true };
  }
}

let now = 1_760_000_000_000;
const pepper = new Uint8Array(32);
for (let index = 0; index < pepper.length; index += 1) pepper[index] = index + 1;

const security = new WebCryptoEmailOtpSecurity(pepper);
const store = new MemoryChallengeStore();
const delivery = new MemoryDelivery();
const rateLimit = new MemoryRateLimit();
const service = new EmailOtpService({ store, delivery, rateLimit, security, now: () => now });

assert(
  normalizeEmailOtpAddress('User.Name+tag@Example.COM') === 'User.Name+tag@example.com',
  'email domain was not canonicalized',
);
assert(normalizeEmailOtpAddress('bad\n@example.com') === null, 'control-character email was accepted');
assert(normalizeEmailOtpAddress('a..b@example.com') === null, 'double-dot local part was accepted');
assert(normalizeEmailOtpAddress('user@localhost') === null, 'non-public single-label domain was accepted');

for (let index = 0; index < 20; index += 1) {
  const code = security.generateCode(EMAIL_OTP_POLICY_CANDIDATE.codeDigits);
  assert(/^\d{6}$/.test(code), 'generated OTP was not six digits');
}

const firstStart = await service.start({
  intent: 'sign_up',
  email: 'User.Name+tag@Example.COM',
  clientKey: 'client-a',
});
assert(firstStart.ok, 'valid OTP start failed');
assert(delivery.deliveries.length === 1, 'OTP delivery was not called once');

const firstDelivery = delivery.deliveries[0];
assert(firstDelivery, 'OTP delivery payload missing');
assert(!firstStart.challenge.maskedDestination.includes('User.Name+tag'), 'masked destination exposed full local part');

const firstRecord = store.records.get(firstStart.challenge.challengeId);
assert(firstRecord, 'challenge record was not persisted');
assert(firstRecord.codeMac !== firstDelivery.code, 'raw OTP was persisted instead of a MAC');
assert(firstRecord.codeMac.length === 64, 'OTP HMAC length is unexpected');
assert(firstRecord.attempts === 0, 'new challenge already had attempts');

const wrong = await service.verify({
  challengeId: firstStart.challenge.challengeId,
  code: firstDelivery.code === '000000' ? '000001' : '000000',
  clientKey: 'client-a',
});
assert(!wrong.ok && wrong.error.code === 'invalid_code', 'wrong OTP did not fail as invalid_code');

const verified = await service.verify({
  challengeId: firstStart.challenge.challengeId,
  code: firstDelivery.code,
  clientKey: 'client-a',
});
assert(verified.ok, 'correct OTP did not verify');
assert(verified.proof.email === 'User.Name+tag@example.com', 'verified email proof is not canonical');
assert(verified.proof.intent === 'sign_up', 'verified intent changed');

const replay = await service.verify({
  challengeId: firstStart.challenge.challengeId,
  code: firstDelivery.code,
});
assert(!replay.ok && replay.error.code === 'invalid_challenge', 'consumed OTP was replayable');

const oldStart = await service.start({ intent: 'sign_in', email: 'repeat@example.com' });
assert(oldStart.ok, 'first repeated-email challenge failed');
const oldCode = delivery.deliveries.at(-1)?.code;
assert(oldCode, 'old challenge code missing');

const newStart = await service.start({ intent: 'sign_in', email: 'repeat@example.com' });
assert(newStart.ok, 'replacement challenge failed');
const newCode = delivery.deliveries.at(-1)?.code;
assert(newCode, 'replacement challenge code missing');

const oldVerify = await service.verify({ challengeId: oldStart.challenge.challengeId, code: oldCode });
assert(!oldVerify.ok && oldVerify.error.code === 'invalid_challenge', 'superseded challenge remained valid');
const newVerify = await service.verify({ challengeId: newStart.challenge.challengeId, code: newCode });
assert(newVerify.ok, 'replacement challenge did not verify');

const lockedStart = await service.start({ intent: 'sign_in', email: 'lock@example.com' });
assert(lockedStart.ok, 'lockout challenge start failed');
const lockedCode = delivery.deliveries.at(-1)?.code;
assert(lockedCode, 'lockout challenge code missing');
const invalidCode = lockedCode === '111111' ? '222222' : '111111';
for (let attempt = 1; attempt <= EMAIL_OTP_POLICY_CANDIDATE.maxAttempts; attempt += 1) {
  const result = await service.verify({ challengeId: lockedStart.challenge.challengeId, code: invalidCode });
  assert(!result.ok, 'invalid OTP unexpectedly verified');
  if (attempt === EMAIL_OTP_POLICY_CANDIDATE.maxAttempts) {
    assert(result.error.code === 'too_many_attempts', 'last allowed wrong attempt did not lock challenge');
  }
}
const lockedCorrect = await service.verify({ challengeId: lockedStart.challenge.challengeId, code: lockedCode });
assert(!lockedCorrect.ok && lockedCorrect.error.code === 'too_many_attempts', 'locked challenge accepted correct OTP');

const expiringStart = await service.start({ intent: 'sign_in', email: 'expire@example.com' });
assert(expiringStart.ok, 'expiry challenge start failed');
const expiringCode = delivery.deliveries.at(-1)?.code;
assert(expiringCode, 'expiry challenge code missing');
now += EMAIL_OTP_POLICY_CANDIDATE.ttlMs;
const expired = await service.verify({ challengeId: expiringStart.challenge.challengeId, code: expiringCode });
assert(!expired.ok && expired.error.code === 'challenge_expired', 'expired OTP challenge remained valid');
now -= EMAIL_OTP_POLICY_CANDIDATE.ttlMs;

delivery.failNext = true;
const deliveryFailure = await service.start({ intent: 'sign_in', email: 'delivery@example.com' });
assert(!deliveryFailure.ok && deliveryFailure.error.code === 'delivery_unavailable', 'delivery failure was not surfaced safely');
assert(
  [...store.records.values()].every((record) => record.email !== 'delivery@example.com'),
  'undelivered challenge was left active after rollback',
);

rateLimit.denyScope = 'start_email';
const denied = await service.start({ intent: 'sign_in', email: 'rate@example.com' });
assert(!denied.ok && denied.error.code === 'rate_limited', 'rate limit denial was ignored');
assert(denied.error.retryAfterSeconds === 37, 'retry-after metadata was lost');
rateLimit.denyScope = null;

const macA = await security.macCode({ challengeId: 'a'.repeat(32), email: 'same@example.com', code: '123456' });
const macB = await security.macCode({ challengeId: 'b'.repeat(32), email: 'same@example.com', code: '123456' });
assert(macA !== macB, 'OTP MAC was not bound to challenge id');
assert(security.equalsMac(macA, macA), 'MAC equality rejected identical MAC');
assert(!security.equalsMac(macA, macB), 'MAC equality accepted different MAC');

console.log('ARVELIS email OTP auth core smoke: PASS');
