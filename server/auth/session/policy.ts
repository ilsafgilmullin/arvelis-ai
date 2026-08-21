export type SessionPolicy = {
  ttlMs: number;
  touchIntervalMs: number;
  listLimit: number;
};

/**
 * Technical defaults for the server-auth spike only.
 * These are not final product/security retention decisions.
 */
export const SESSION_POLICY_CANDIDATE: Readonly<SessionPolicy> = Object.freeze({
  ttlMs: 30 * 24 * 60 * 60 * 1000,
  touchIntervalMs: 5 * 60 * 1000,
  listLimit: 50,
});
