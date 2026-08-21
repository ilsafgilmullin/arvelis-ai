import type { AccountAuthenticationReader, AccountAuthenticationSnapshot } from '../account/contracts';
import type {
  AuthenticatedSession,
  SessionAuthenticateResult,
  SessionClock,
  SessionIssueInput,
  SessionIssueResult,
  SessionRecord,
  SessionRevokeReason,
  SessionSecurityPort,
  SessionStore,
  SessionSummary,
} from './contracts';
import { SESSION_POLICY_CANDIDATE, type SessionPolicy } from './policy';

const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;
const SESSION_SECRET_PATTERN = /^[a-f0-9]{64}$/;
const UNSAFE_TEXT_PATTERN = /\p{C}/u;
const MAX_LABEL_LENGTH = 120;
const MAX_ACCOUNT_ID_LENGTH = 128;

function isCanonicalAccountId(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_ACCOUNT_ID_LENGTH
    && value.trim() === value
    && !UNSAFE_TEXT_PATTERN.test(value);
}

function isValidSecurityVersion(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidAccountSnapshot(account: AccountAuthenticationSnapshot): boolean {
  return isCanonicalAccountId(account.id)
    && isValidSecurityVersion(account.securityVersion)
    && ['active', 'suspended', 'pending_deletion', 'deleted'].includes(account.status);
}

function normalizeOptionalLabel(value: string | undefined): string | null | undefined {
  if (value === undefined) return null;
  if (!value || value.length > MAX_LABEL_LENGTH || value.trim() !== value || UNSAFE_TEXT_PATTERN.test(value)) {
    return undefined;
  }
  return value;
}

function isValidRecord(record: SessionRecord): boolean {
  return SESSION_ID_PATTERN.test(record.id)
    && isCanonicalAccountId(record.accountId)
    && /^[a-f0-9]{64}$/.test(record.secretMac)
    && isValidSecurityVersion(record.securityVersion)
    && Number.isFinite(record.createdAt)
    && Number.isFinite(record.lastSeenAt)
    && Number.isFinite(record.expiresAt)
    && record.createdAt <= record.lastSeenAt
    && record.lastSeenAt <= record.expiresAt
    && record.expiresAt > record.createdAt
    && (record.revokedAt === null || Number.isFinite(record.revokedAt))
    && (record.deviceLabel === null || normalizeOptionalLabel(record.deviceLabel) === record.deviceLabel)
    && (record.browserLabel === null || normalizeOptionalLabel(record.browserLabel) === record.browserLabel);
}

export type SessionServiceDependencies = {
  store: SessionStore;
  accounts: AccountAuthenticationReader;
  security: SessionSecurityPort;
  now?: SessionClock;
  policy?: Readonly<SessionPolicy>;
};

export class SessionService {
  private readonly store: SessionStore;
  private readonly accounts: AccountAuthenticationReader;
  private readonly security: SessionSecurityPort;
  private readonly now: SessionClock;
  private readonly policy: Readonly<SessionPolicy>;

  constructor(dependencies: SessionServiceDependencies) {
    this.store = dependencies.store;
    this.accounts = dependencies.accounts;
    this.security = dependencies.security;
    this.now = dependencies.now ?? Date.now;
    this.policy = dependencies.policy ?? SESSION_POLICY_CANDIDATE;
  }

  async issue(input: SessionIssueInput): Promise<SessionIssueResult> {
    if (!isValidAccountSnapshot(input.account) || input.account.status !== 'active') {
      return { ok: false, error: 'account_unavailable' };
    }

    const deviceLabel = normalizeOptionalLabel(input.deviceLabel);
    const browserLabel = normalizeOptionalLabel(input.browserLabel);
    if (deviceLabel === undefined || browserLabel === undefined) {
      return { ok: false, error: 'service_unavailable' };
    }

    try {
      const now = this.now();
      const sessionId = this.security.generateSessionId();
      const secret = this.security.generateSessionSecret();
      if (!SESSION_ID_PATTERN.test(sessionId) || !SESSION_SECRET_PATTERN.test(secret)) {
        return { ok: false, error: 'service_unavailable' };
      }

      const secretMac = await this.security.macSessionSecret({ sessionId, secret });
      const expiresAt = now + this.policy.ttlMs;
      const record: SessionRecord = {
        id: sessionId,
        accountId: input.account.id,
        secretMac,
        securityVersion: input.account.securityVersion,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        revokedAt: null,
        revokeReason: null,
        deviceLabel,
        browserLabel,
      };

      if (!isValidRecord(record)) return { ok: false, error: 'service_unavailable' };
      await this.store.create(record);

      return {
        ok: true,
        session: {
          sessionId,
          secret,
          createdAt: now,
          expiresAt,
        },
      };
    } catch {
      return { ok: false, error: 'service_unavailable' };
    }
  }

  async authenticate(input: { sessionId: string; secret: string }): Promise<SessionAuthenticateResult> {
    if (!SESSION_ID_PATTERN.test(input.sessionId) || !SESSION_SECRET_PATTERN.test(input.secret)) {
      return { ok: false, error: 'invalid_session' };
    }

    try {
      const record = await this.store.findById(input.sessionId);
      if (!record || !isValidRecord(record) || record.revokedAt !== null) {
        return { ok: false, error: 'invalid_session' };
      }

      const now = this.now();
      if (now >= record.expiresAt) {
        await this.safeRevoke(record, now, 'expired_cleanup');
        return { ok: false, error: 'session_expired' };
      }

      const validSecret = await this.security.verifySessionSecret({
        sessionId: record.id,
        secret: input.secret,
        expectedMac: record.secretMac,
      });
      if (!validSecret) return { ok: false, error: 'invalid_session' };

      const account = await this.accounts.getAuthenticationSnapshot(record.accountId);
      if (!account || !isValidAccountSnapshot(account) || account.status !== 'active') {
        await this.safeRevoke(record, now, 'account_disabled');
        return { ok: false, error: 'account_unavailable' };
      }

      if (account.securityVersion !== record.securityVersion) {
        await this.safeRevoke(record, now, 'security_change');
        return { ok: false, error: 'invalid_session' };
      }

      let lastSeenAt = record.lastSeenAt;
      if (now - record.lastSeenAt >= this.policy.touchIntervalMs) {
        try {
          if (await this.store.touch(record.id, record.accountId, now)) lastSeenAt = now;
        } catch {
          // Last-seen metadata is non-authoritative. A failure to refresh it
          // must not silently convert a cryptographically valid session into a
          // logged-out user after all security checks already passed.
        }
      }

      const session: AuthenticatedSession = {
        sessionId: record.id,
        account,
        createdAt: record.createdAt,
        lastSeenAt,
        expiresAt: record.expiresAt,
      };
      return { ok: true, session };
    } catch {
      return { ok: false, error: 'service_unavailable' };
    }
  }

  async listForAccount(accountId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    if (!isCanonicalAccountId(accountId)) return [];
    if (currentSessionId !== undefined && !SESSION_ID_PATTERN.test(currentSessionId)) return [];

    try {
      const now = this.now();
      const records = await this.store.listForAccount(accountId, now, this.policy.listLimit);
      return records
        .filter((record) => isValidRecord(record)
          && record.accountId === accountId
          && record.revokedAt === null
          && now < record.expiresAt)
        .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
        .slice(0, this.policy.listLimit)
        .map((record) => ({
          id: record.id,
          current: record.id === currentSessionId,
          createdAt: record.createdAt,
          lastSeenAt: record.lastSeenAt,
          expiresAt: record.expiresAt,
          deviceLabel: record.deviceLabel,
          browserLabel: record.browserLabel,
        }));
    } catch {
      return [];
    }
  }

  async revokeOwned(
    accountId: string,
    sessionId: string,
    reason: SessionRevokeReason = 'user_revoke',
  ): Promise<boolean> {
    if (!isCanonicalAccountId(accountId) || !SESSION_ID_PATTERN.test(sessionId)) return false;
    try {
      return await this.store.revokeOwned(sessionId, accountId, this.now(), reason);
    } catch {
      return false;
    }
  }

  async revokeAllForAccount(
    accountId: string,
    reason: SessionRevokeReason = 'security_change',
  ): Promise<number> {
    if (!isCanonicalAccountId(accountId)) return 0;
    try {
      return await this.store.revokeAllForAccount(accountId, this.now(), reason);
    } catch {
      return 0;
    }
  }

  private async safeRevoke(record: SessionRecord, revokedAt: number, reason: SessionRevokeReason): Promise<void> {
    try {
      await this.store.revokeOwned(record.id, record.accountId, revokedAt, reason);
    } catch {
      // Authentication already fails closed. Revoke is best-effort cleanup;
      // the next verification repeats account/version/expiry checks.
    }
  }
}
