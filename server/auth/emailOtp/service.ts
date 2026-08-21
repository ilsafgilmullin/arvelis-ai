import type {
  EmailOtpChallengeRecord,
  EmailOtpChallengeStore,
  EmailOtpClock,
  EmailOtpDeliveryPort,
  EmailOtpFailure,
  EmailOtpRateLimitDecision,
  EmailOtpRateLimitPort,
  EmailOtpRateLimitScope,
  EmailOtpSecurityPort,
  EmailOtpStartRequest,
  EmailOtpStartResult,
  EmailOtpVerifyRequest,
  EmailOtpVerifyResult,
} from './contracts';
import { emailOtpRateIdentity, maskEmailOtpAddress, normalizeEmailOtpAddress } from './emailAddress';
import { EMAIL_OTP_POLICY_CANDIDATE, type EmailOtpPolicy } from './policy';

const CHALLENGE_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_CLIENT_KEY_LENGTH = 256;
const UNSAFE_TEXT_PATTERN = /\p{C}/u;

function failure(code: EmailOtpFailure['code'], retryAfterSeconds?: number): EmailOtpFailure {
  return retryAfterSeconds === undefined ? { code } : { code, retryAfterSeconds };
}

function isValidClientKey(value: string | undefined): value is string {
  return value !== undefined
    && value.length > 0
    && value.length <= MAX_CLIENT_KEY_LENGTH
    && value.trim() === value
    && !UNSAFE_TEXT_PATTERN.test(value);
}

function isValidCode(value: string, digits: number): boolean {
  return value.length === digits && /^\d+$/.test(value);
}

export type EmailOtpServiceDependencies = {
  store: EmailOtpChallengeStore;
  delivery: EmailOtpDeliveryPort;
  rateLimit: EmailOtpRateLimitPort;
  security: EmailOtpSecurityPort;
  now?: EmailOtpClock;
  policy?: Readonly<EmailOtpPolicy>;
};

export class EmailOtpService {
  private readonly store: EmailOtpChallengeStore;
  private readonly delivery: EmailOtpDeliveryPort;
  private readonly rateLimit: EmailOtpRateLimitPort;
  private readonly security: EmailOtpSecurityPort;
  private readonly now: EmailOtpClock;
  private readonly policy: Readonly<EmailOtpPolicy>;

  constructor(dependencies: EmailOtpServiceDependencies) {
    this.store = dependencies.store;
    this.delivery = dependencies.delivery;
    this.rateLimit = dependencies.rateLimit;
    this.security = dependencies.security;
    this.now = dependencies.now ?? Date.now;
    this.policy = dependencies.policy ?? EMAIL_OTP_POLICY_CANDIDATE;
  }

  private async consumeLimit(input: {
    scope: EmailOtpRateLimitScope;
    rawKey: string;
    limit: number;
    windowMs: number;
    now: number;
  }): Promise<EmailOtpRateLimitDecision> {
    const key = await this.security.derivePrivacyKey(input.scope, input.rawKey);
    return this.rateLimit.consume({
      scope: input.scope,
      key,
      limit: input.limit,
      windowMs: input.windowMs,
      now: input.now,
    });
  }

  private async checkStartLimits(email: string, clientKey: string | undefined, now: number): Promise<EmailOtpFailure | null> {
    const emailDecision = await this.consumeLimit({
      scope: 'start_email',
      rawKey: emailOtpRateIdentity(email),
      limit: this.policy.startEmailLimit,
      windowMs: this.policy.startEmailWindowMs,
      now,
    });
    if (!emailDecision.allowed) return failure('rate_limited', emailDecision.retryAfterSeconds);

    if (!isValidClientKey(clientKey)) return null;
    const clientDecision = await this.consumeLimit({
      scope: 'start_client',
      rawKey: clientKey,
      limit: this.policy.startClientLimit,
      windowMs: this.policy.startClientWindowMs,
      now,
    });
    return clientDecision.allowed ? null : failure('rate_limited', clientDecision.retryAfterSeconds);
  }

  private async checkVerifyLimits(challengeId: string, clientKey: string | undefined, now: number): Promise<EmailOtpFailure | null> {
    const challengeDecision = await this.consumeLimit({
      scope: 'verify_challenge',
      rawKey: challengeId,
      limit: this.policy.verifyChallengeLimit,
      windowMs: this.policy.verifyChallengeWindowMs,
      now,
    });
    if (!challengeDecision.allowed) return failure('rate_limited', challengeDecision.retryAfterSeconds);

    if (!isValidClientKey(clientKey)) return null;
    const clientDecision = await this.consumeLimit({
      scope: 'verify_client',
      rawKey: clientKey,
      limit: this.policy.verifyClientLimit,
      windowMs: this.policy.verifyClientWindowMs,
      now,
    });
    return clientDecision.allowed ? null : failure('rate_limited', clientDecision.retryAfterSeconds);
  }

  async start(request: EmailOtpStartRequest): Promise<EmailOtpStartResult> {
    const email = normalizeEmailOtpAddress(request.email);
    if (!email) return { ok: false, error: failure('invalid_input') };
    if (request.clientKey !== undefined && !isValidClientKey(request.clientKey)) {
      return { ok: false, error: failure('invalid_input') };
    }

    const now = this.now();

    try {
      const limitFailure = await this.checkStartLimits(email, request.clientKey, now);
      if (limitFailure) return { ok: false, error: limitFailure };

      const challengeId = this.security.generateChallengeId();
      const code = this.security.generateCode(this.policy.codeDigits);
      const codeMac = await this.security.macCode({ challengeId, email, code });
      const expiresAt = now + this.policy.ttlMs;

      const record: EmailOtpChallengeRecord = {
        id: challengeId,
        intent: request.intent,
        email,
        codeMac,
        createdAt: now,
        activatedAt: null,
        expiresAt,
        attempts: 0,
        maxAttempts: this.policy.maxAttempts,
        consumedAt: null,
        supersededAt: null,
      };

      await this.store.createPending(record);

      try {
        await this.delivery.sendCode({
          to: email,
          code,
          intent: request.intent,
          expiresAt,
        });
      } catch {
        try {
          await this.store.delete(challengeId);
        } catch {
          // Best-effort cleanup. Pending challenge remains non-verifiable.
        }
        return { ok: false, error: failure('delivery_unavailable') };
      }

      // A delivery provider can stall long enough for a code to expire. Never
      // let such a code supersede a still-valid earlier challenge after it is
      // already unusable itself.
      const activatedAt = this.now();
      if (activatedAt >= expiresAt) {
        try {
          await this.store.delete(challengeId);
        } catch {
          // Best-effort cleanup. The pending challenge is never verifiable.
        }
        return { ok: false, error: failure('service_unavailable') };
      }

      const activated = await this.store.activateReplacingActive(challengeId, activatedAt);
      if (!activated) {
        try {
          await this.store.delete(challengeId);
        } catch {
          // Best-effort cleanup. Existing active challenge remains untouched
          // when activation is implemented atomically by the persistence port.
        }
        return { ok: false, error: failure('service_unavailable') };
      }

      return {
        ok: true,
        challenge: {
          challengeId,
          kind: 'code',
          maskedDestination: maskEmailOtpAddress(email),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    } catch {
      return { ok: false, error: failure('service_unavailable') };
    }
  }

  async verify(request: EmailOtpVerifyRequest): Promise<EmailOtpVerifyResult> {
    if (!CHALLENGE_ID_PATTERN.test(request.challengeId) || !isValidCode(request.code, this.policy.codeDigits)) {
      return { ok: false, error: failure('invalid_input') };
    }
    if (request.clientKey !== undefined && !isValidClientKey(request.clientKey)) {
      return { ok: false, error: failure('invalid_input') };
    }

    const now = this.now();

    try {
      const limitFailure = await this.checkVerifyLimits(request.challengeId, request.clientKey, now);
      if (limitFailure) return { ok: false, error: limitFailure };

      const attempt = await this.store.beginAttempt(request.challengeId, now);
      if (attempt.status !== 'ready') {
        if (attempt.status === 'expired') return { ok: false, error: failure('challenge_expired') };
        if (attempt.status === 'locked') return { ok: false, error: failure('too_many_attempts') };
        return { ok: false, error: failure('invalid_challenge') };
      }

      const validCode = await this.security.verifyCodeMac({
        challengeId: attempt.record.id,
        email: attempt.record.email,
        code: request.code,
        expectedMac: attempt.record.codeMac,
      });

      if (!validCode) {
        return {
          ok: false,
          error: failure(attempt.attemptNumber >= attempt.record.maxAttempts ? 'too_many_attempts' : 'invalid_code'),
        };
      }

      const consumed = await this.store.consume(attempt.record.id, attempt.attemptNumber, now);
      if (!consumed) return { ok: false, error: failure('invalid_challenge') };

      return {
        ok: true,
        proof: {
          challengeId: attempt.record.id,
          intent: attempt.record.intent,
          email: attempt.record.email,
          verifiedAt: now,
        },
      };
    } catch {
      return { ok: false, error: failure('service_unavailable') };
    }
  }
}
