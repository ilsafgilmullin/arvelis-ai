export type EmailOtpIntent = 'sign_in' | 'sign_up';

export type EmailOtpFailureCode =
  | 'invalid_input'
  | 'rate_limited'
  | 'delivery_unavailable'
  | 'invalid_challenge'
  | 'challenge_expired'
  | 'too_many_attempts'
  | 'invalid_code'
  | 'service_unavailable';

export type EmailOtpFailure = {
  code: EmailOtpFailureCode;
  retryAfterSeconds?: number;
};

export type EmailOtpStartRequest = {
  intent: EmailOtpIntent;
  email: string;
  clientKey?: string;
};

export type EmailOtpPublicChallenge = {
  challengeId: string;
  kind: 'code';
  maskedDestination: string;
  expiresAt: string;
};

export type EmailOtpStartResult =
  | { ok: true; challenge: EmailOtpPublicChallenge }
  | { ok: false; error: EmailOtpFailure };

export type EmailOtpVerifyRequest = {
  challengeId: string;
  code: string;
  clientKey?: string;
};

/** Internal server proof. Never return this object directly to the frontend. */
export type VerifiedEmailOtpProof = {
  challengeId: string;
  intent: EmailOtpIntent;
  email: string;
  verifiedAt: number;
};

export type EmailOtpVerifyResult =
  | { ok: true; proof: VerifiedEmailOtpProof }
  | { ok: false; error: EmailOtpFailure };

export type EmailOtpChallengeRecord = {
  id: string;
  intent: EmailOtpIntent;
  email: string;
  codeMac: string;
  createdAt: number;
  activatedAt: number | null;
  expiresAt: number;
  attempts: number;
  maxAttempts: number;
  consumedAt: number | null;
  supersededAt: number | null;
};

export type EmailOtpAttemptResult =
  | {
      status: 'ready';
      record: EmailOtpChallengeRecord;
      attemptNumber: number;
    }
  | {
      status: 'missing' | 'pending' | 'expired' | 'consumed' | 'superseded' | 'locked';
    };

/**
 * Production adapter requirements:
 * - createPending() persists an inactive challenge;
 * - activateReplacingActive() atomically activates delivered challenge and
 *   supersedes prior active challenge(s) for the same email + intent;
 * - beginAttempt() atomically increments attempts only for active challenges;
 * - consume() atomically enforces single-use and expected attempt version.
 */
export interface EmailOtpChallengeStore {
  createPending(record: EmailOtpChallengeRecord): Promise<void>;
  activateReplacingActive(challengeId: string, activatedAt: number): Promise<boolean>;
  delete(challengeId: string): Promise<void>;
  beginAttempt(challengeId: string, now: number): Promise<EmailOtpAttemptResult>;
  consume(challengeId: string, expectedAttemptNumber: number, consumedAt: number): Promise<boolean>;
}

export type EmailOtpDelivery = {
  to: string;
  code: string;
  intent: EmailOtpIntent;
  expiresAt: number;
};

/** Raw OTP is allowed to cross only this delivery port. It must not be logged. */
export interface EmailOtpDeliveryPort {
  sendCode(delivery: EmailOtpDelivery): Promise<void>;
}

export type EmailOtpRateLimitScope =
  | 'start_email'
  | 'start_client'
  | 'verify_challenge'
  | 'verify_client';

export type EmailOtpRateLimitRequest = {
  scope: EmailOtpRateLimitScope;
  key: string;
  limit: number;
  windowMs: number;
  now: number;
};

export type EmailOtpRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export interface EmailOtpRateLimitPort {
  consume(request: EmailOtpRateLimitRequest): Promise<EmailOtpRateLimitDecision>;
}

export interface EmailOtpSecurityPort {
  generateChallengeId(): string;
  generateCode(digits: number): string;
  macCode(input: {
    challengeId: string;
    email: string;
    code: string;
  }): Promise<string>;
  verifyCodeMac(input: {
    challengeId: string;
    email: string;
    code: string;
    expectedMac: string;
  }): Promise<boolean>;
  derivePrivacyKey(scope: EmailOtpRateLimitScope, value: string): Promise<string>;
}

export type EmailOtpClock = () => number;
