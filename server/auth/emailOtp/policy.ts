export type EmailOtpPolicy = {
  codeDigits: number;
  ttlMs: number;
  maxAttempts: number;
  startEmailLimit: number;
  startEmailWindowMs: number;
  startClientLimit: number;
  startClientWindowMs: number;
  verifyChallengeLimit: number;
  verifyChallengeWindowMs: number;
  verifyClientLimit: number;
  verifyClientWindowMs: number;
};

/**
 * Security candidate defaults for the first backend spike.
 *
 * They are intentionally centralized and MUST be reviewed against production
 * telemetry, email-delivery characteristics and abuse testing before public
 * launch. They are not pricing/product quotas.
 */
export const EMAIL_OTP_POLICY_CANDIDATE: Readonly<EmailOtpPolicy> = Object.freeze({
  codeDigits: 6,
  ttlMs: 10 * 60 * 1000,
  maxAttempts: 5,
  startEmailLimit: 5,
  startEmailWindowMs: 15 * 60 * 1000,
  startClientLimit: 20,
  startClientWindowMs: 15 * 60 * 1000,
  verifyChallengeLimit: 8,
  verifyChallengeWindowMs: 10 * 60 * 1000,
  verifyClientLimit: 30,
  verifyClientWindowMs: 15 * 60 * 1000,
});
