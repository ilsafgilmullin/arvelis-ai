import type { AccountAuthenticationSnapshot } from '../account/contracts';

export type SessionRevokeReason =
  | 'user_sign_out'
  | 'user_revoke'
  | 'security_change'
  | 'account_disabled'
  | 'expired_cleanup';

export type SessionRecord = {
  id: string;
  accountId: string;
  secretMac: string;
  securityVersion: number;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  revokeReason: SessionRevokeReason | null;
  deviceLabel: string | null;
  browserLabel: string | null;
};

/**
 * Internal server credential. The raw secret is intended only for the trusted
 * HTTP/BFF adapter that will set the protected browser cookie.
 */
export type IssuedServerSession = {
  sessionId: string;
  secret: string;
  createdAt: number;
  expiresAt: number;
};

export type SessionAuthenticationInput = {
  sessionId: string;
  secret: string;
};

export type AuthenticatedSession = {
  sessionId: string;
  account: AccountAuthenticationSnapshot;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
};

export type SessionSummary = {
  id: string;
  current: boolean;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  deviceLabel: string | null;
  browserLabel: string | null;
};

export type SessionIssueInput = {
  account: AccountAuthenticationSnapshot;
  deviceLabel?: string;
  browserLabel?: string;
};

export type SessionIssueResult =
  | { ok: true; session: IssuedServerSession }
  | { ok: false; error: 'account_unavailable' | 'service_unavailable' };

export type SessionAuthenticateResult =
  | { ok: true; session: AuthenticatedSession }
  | {
      ok: false;
      error:
        | 'invalid_session'
        | 'session_expired'
        | 'account_unavailable'
        | 'service_unavailable';
    };

export type SessionListResult =
  | { ok: true; sessions: SessionSummary[] }
  | { ok: false; error: 'invalid_request' | 'service_unavailable' };

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  findById(sessionId: string): Promise<SessionRecord | null>;
  touch(sessionId: string, accountId: string, seenAt: number): Promise<boolean>;
  revokeOwned(
    sessionId: string,
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<boolean>;
  revokeAllForAccount(
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<number>;
  listForAccount(accountId: string, now: number, limit: number): Promise<SessionRecord[]>;
}

export interface SessionSecurityPort {
  generateSessionId(): string;
  generateSessionSecret(): string;
  macSessionSecret(input: { sessionId: string; secret: string }): Promise<string>;
  verifySessionSecret(input: {
    sessionId: string;
    secret: string;
    expectedMac: string;
  }): Promise<boolean>;
}

export type SessionClock = () => number;
