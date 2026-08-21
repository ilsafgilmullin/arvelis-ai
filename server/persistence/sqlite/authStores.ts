import type { DatabaseSync } from 'node:sqlite';
import type {
  AccountAuthenticationReader,
  AccountAuthenticationSnapshot,
  AccountIdentityStore,
  AccountRecord,
  CreateAccountWithEmailIdentityInput,
  CreateAccountWithEmailIdentityResult,
  EmailIdentityRecord,
} from '../../auth/account/contracts';
import type {
  EmailOtpAttemptResult,
  EmailOtpChallengeRecord,
  EmailOtpChallengeStore,
  EmailOtpRateLimitDecision,
  EmailOtpRateLimitPort,
  EmailOtpRateLimitRequest,
} from '../../auth/emailOtp/contracts';
import type { SessionRecord, SessionRevokeReason, SessionStore } from '../../auth/session/contracts';
import { inSqliteTransaction } from './database';

type AccountRow = {
  id: string;
  display_name: string;
  status: AccountRecord['status'];
  security_version: number;
  created_at: number;
  updated_at: number;
};

type IdentityRow = {
  id: string;
  account_id: string;
  canonical_email: string;
  verified_at: number;
  linked_at: number;
  last_authenticated_at: number | null;
  disabled_at: number | null;
};

type ChallengeRow = {
  id: string;
  intent: EmailOtpChallengeRecord['intent'];
  email: string;
  code_mac: string;
  created_at: number;
  activated_at: number | null;
  expires_at: number;
  attempts: number;
  max_attempts: number;
  consumed_at: number | null;
  superseded_at: number | null;
};

type RateLimitRow = {
  window_started_at: number;
  consumed_count: number;
  expires_at: number;
};

type SessionRow = {
  id: string;
  account_id: string;
  secret_mac: string;
  security_version: number;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
  revoke_reason: SessionRevokeReason | null;
  device_label: string | null;
  browser_label: string | null;
};

function accountFromRow(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    securityVersion: row.security_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function identityFromRow(row: IdentityRow): EmailIdentityRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: 'email_otp',
    canonicalEmail: row.canonical_email,
    verifiedAt: row.verified_at,
    linkedAt: row.linked_at,
    lastAuthenticatedAt: row.last_authenticated_at,
    disabledAt: row.disabled_at,
  };
}

function challengeFromRow(row: ChallengeRow): EmailOtpChallengeRecord {
  return {
    id: row.id,
    intent: row.intent,
    email: row.email,
    codeMac: row.code_mac,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    consumedAt: row.consumed_at,
    supersededAt: row.superseded_at,
  };
}

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    secretMac: row.secret_mac,
    securityVersion: row.security_version,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    deviceLabel: row.device_label,
    browserLabel: row.browser_label,
  };
}

export class SqliteAccountIdentityStore implements AccountIdentityStore, AccountAuthenticationReader {
  constructor(private readonly database: DatabaseSync) {}

  async findEmailIdentity(canonicalEmail: string): Promise<EmailIdentityRecord | null> {
    const row = this.database.prepare(`
      SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
      FROM auth_email_identities
      WHERE canonical_email = ?
      LIMIT 1
    `).get(canonicalEmail) as IdentityRow | undefined;
    return row ? identityFromRow(row) : null;
  }

  async findEmailIdentityForAccount(accountId: string): Promise<EmailIdentityRecord | null> {
    const row = this.database.prepare(`
      SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
      FROM auth_email_identities
      WHERE account_id = ? AND disabled_at IS NULL
      ORDER BY linked_at ASC
      LIMIT 1
    `).get(accountId) as IdentityRow | undefined;
    return row ? identityFromRow(row) : null;
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const row = this.database.prepare(`
      SELECT id, display_name, status, security_version, created_at, updated_at
      FROM auth_accounts
      WHERE id = ?
      LIMIT 1
    `).get(accountId) as AccountRow | undefined;
    return row ? accountFromRow(row) : null;
  }

  async getAuthenticationSnapshot(accountId: string): Promise<AccountAuthenticationSnapshot | null> {
    const account = await this.getAccount(accountId);
    return account ? { id: account.id, status: account.status, securityVersion: account.securityVersion } : null;
  }

  async createAccountWithEmailIdentity(
    input: CreateAccountWithEmailIdentityInput,
  ): Promise<CreateAccountWithEmailIdentityResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const existing = this.database.prepare(`
          SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
          FROM auth_email_identities
          WHERE canonical_email = ?
          LIMIT 1
        `).get(input.canonicalEmail) as IdentityRow | undefined;
        if (existing) return { status: 'email_conflict' as const, identity: identityFromRow(existing) };

        this.database.prepare(`
          INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
          VALUES (?, ?, 'active', 1, ?, ?)
        `).run(input.accountId, input.displayName, input.createdAt, input.createdAt);

        this.database.prepare(`
          INSERT INTO auth_email_identities (
            id, account_id, kind, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
          ) VALUES (?, ?, 'email_otp', ?, ?, ?, ?, NULL)
        `).run(
          input.identityId,
          input.accountId,
          input.canonicalEmail,
          input.verifiedAt,
          input.createdAt,
          input.verifiedAt,
        );

        const account = this.database.prepare(`
          SELECT id, display_name, status, security_version, created_at, updated_at
          FROM auth_accounts WHERE id = ?
        `).get(input.accountId) as AccountRow | undefined;
        const identity = this.database.prepare(`
          SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
          FROM auth_email_identities WHERE id = ?
        `).get(input.identityId) as IdentityRow | undefined;
        if (!account || !identity) throw new Error('SQLite account creation returned no rows');

        return {
          status: 'created' as const,
          account: accountFromRow(account),
          identity: identityFromRow(identity),
        };
      });
    } catch (error) {
      const identity = await this.findEmailIdentity(input.canonicalEmail);
      if (identity) return { status: 'email_conflict', identity };
      throw error;
    }
  }

  async markIdentityAuthenticated(identityId: string, authenticatedAt: number): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_email_identities
      SET last_authenticated_at = ?
      WHERE id = ? AND disabled_at IS NULL
    `).run(authenticatedAt, identityId);
    return result.changes === 1;
  }
}

export class SqliteEmailOtpChallengeStore implements EmailOtpChallengeStore {
  constructor(private readonly database: DatabaseSync) {}

  async createPending(record: EmailOtpChallengeRecord): Promise<void> {
    this.database.prepare(`
      INSERT INTO auth_email_otp_challenges (
        id, intent, email, code_mac, created_at, activated_at, expires_at,
        attempts, max_attempts, consumed_at, superseded_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL)
    `).run(
      record.id,
      record.intent,
      record.email,
      record.codeMac,
      record.createdAt,
      record.expiresAt,
      record.attempts,
      record.maxAttempts,
    );
  }

  async activateReplacingActive(challengeId: string, activatedAt: number): Promise<boolean> {
    return inSqliteTransaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT id, intent, email, code_mac, created_at, activated_at, expires_at,
               attempts, max_attempts, consumed_at, superseded_at
        FROM auth_email_otp_challenges WHERE id = ?
      `).get(challengeId) as ChallengeRow | undefined;
      if (!row || row.activated_at !== null || row.consumed_at !== null || row.superseded_at !== null) {
        return false;
      }

      this.database.prepare(`
        UPDATE auth_email_otp_challenges
        SET superseded_at = ?
        WHERE email = ?
          AND intent = ?
          AND id <> ?
          AND activated_at IS NOT NULL
          AND consumed_at IS NULL
          AND superseded_at IS NULL
      `).run(activatedAt, row.email, row.intent, challengeId);

      const activated = this.database.prepare(`
        UPDATE auth_email_otp_challenges
        SET activated_at = ?
        WHERE id = ?
          AND activated_at IS NULL
          AND consumed_at IS NULL
          AND superseded_at IS NULL
      `).run(activatedAt, challengeId);
      return activated.changes === 1;
    });
  }

  async delete(challengeId: string): Promise<void> {
    this.database.prepare(`
      DELETE FROM auth_email_otp_challenges
      WHERE id = ? AND activated_at IS NULL AND consumed_at IS NULL AND superseded_at IS NULL
    `).run(challengeId);
  }

  async beginAttempt(challengeId: string, now: number): Promise<EmailOtpAttemptResult> {
    return inSqliteTransaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT id, intent, email, code_mac, created_at, activated_at, expires_at,
               attempts, max_attempts, consumed_at, superseded_at
        FROM auth_email_otp_challenges WHERE id = ?
      `).get(challengeId) as ChallengeRow | undefined;
      if (!row) return { status: 'missing' as const };

      const record = challengeFromRow(row);
      if (record.activatedAt === null) return { status: 'pending' as const };
      if (record.consumedAt !== null) return { status: 'consumed' as const };
      if (record.supersededAt !== null) return { status: 'superseded' as const };
      if (now >= record.expiresAt) return { status: 'expired' as const };
      if (record.attempts >= record.maxAttempts) return { status: 'locked' as const };

      const attemptNumber = record.attempts + 1;
      const updated = this.database.prepare(`
        UPDATE auth_email_otp_challenges
        SET attempts = ?
        WHERE id = ? AND attempts = ?
      `).run(attemptNumber, challengeId, record.attempts);
      if (updated.changes !== 1) throw new Error('SQLite OTP attempt update failed');

      return {
        status: 'ready' as const,
        record: { ...record, attempts: attemptNumber },
        attemptNumber,
      };
    });
  }

  async consume(challengeId: string, expectedAttemptNumber: number, consumedAt: number): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_email_otp_challenges
      SET consumed_at = ?
      WHERE id = ?
        AND attempts = ?
        AND activated_at IS NOT NULL
        AND consumed_at IS NULL
        AND superseded_at IS NULL
        AND expires_at > ?
    `).run(consumedAt, challengeId, expectedAttemptNumber, consumedAt);
    return result.changes === 1;
  }
}

export class SqliteEmailOtpRateLimitStore implements EmailOtpRateLimitPort {
  constructor(private readonly database: DatabaseSync) {}

  async consume(request: EmailOtpRateLimitRequest): Promise<EmailOtpRateLimitDecision> {
    return inSqliteTransaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT window_started_at, consumed_count, expires_at
        FROM auth_rate_limits
        WHERE scope = ? AND key_hash = ?
      `).get(request.scope, request.key) as RateLimitRow | undefined;

      if (!row) {
        this.database.prepare(`
          INSERT INTO auth_rate_limits (scope, key_hash, window_started_at, consumed_count, expires_at)
          VALUES (?, ?, ?, 1, ?)
        `).run(request.scope, request.key, request.now, request.now + request.windowMs);
        return { allowed: true };
      }

      const windowEndsAt = row.window_started_at + request.windowMs;
      if (request.now >= windowEndsAt) {
        this.database.prepare(`
          UPDATE auth_rate_limits
          SET window_started_at = ?, consumed_count = 1, expires_at = ?
          WHERE scope = ? AND key_hash = ?
        `).run(request.now, request.now + request.windowMs, request.scope, request.key);
        return { allowed: true };
      }

      if (row.consumed_count >= request.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - request.now) / 1000)),
        };
      }

      this.database.prepare(`
        UPDATE auth_rate_limits
        SET consumed_count = consumed_count + 1, expires_at = ?
        WHERE scope = ? AND key_hash = ?
      `).run(windowEndsAt, request.scope, request.key);
      return { allowed: true };
    });
  }
}

export class SqliteSessionStore implements SessionStore {
  constructor(private readonly database: DatabaseSync) {}

  async create(record: SessionRecord): Promise<void> {
    this.database.prepare(`
      INSERT INTO auth_sessions (
        id, account_id, secret_mac, security_version, created_at, last_seen_at,
        expires_at, revoked_at, revoke_reason, device_label, browser_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      record.id,
      record.accountId,
      record.secretMac,
      record.securityVersion,
      record.createdAt,
      record.lastSeenAt,
      record.expiresAt,
      record.deviceLabel,
      record.browserLabel,
    );
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const row = this.database.prepare(`
      SELECT id, account_id, secret_mac, security_version, created_at, last_seen_at,
             expires_at, revoked_at, revoke_reason, device_label, browser_label
      FROM auth_sessions WHERE id = ? LIMIT 1
    `).get(sessionId) as SessionRow | undefined;
    return row ? sessionFromRow(row) : null;
  }

  async touch(sessionId: string, accountId: string, seenAt: number): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_sessions
      SET last_seen_at = ?
      WHERE id = ? AND account_id = ? AND revoked_at IS NULL AND expires_at > ?
    `).run(seenAt, sessionId, accountId, seenAt);
    return result.changes === 1;
  }

  async revokeOwned(
    sessionId: string,
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?, revoke_reason = ?
      WHERE id = ? AND account_id = ? AND revoked_at IS NULL
    `).run(revokedAt, reason, sessionId, accountId);
    return result.changes === 1;
  }

  async revokeAllForAccount(
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<number> {
    const result = this.database.prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?, revoke_reason = ?
      WHERE account_id = ? AND revoked_at IS NULL
    `).run(revokedAt, reason, accountId);
    return Number(result.changes);
  }

  async listForAccount(accountId: string, now: number, limit: number): Promise<SessionRecord[]> {
    const rows = this.database.prepare(`
      SELECT id, account_id, secret_mac, security_version, created_at, last_seen_at,
             expires_at, revoked_at, revoke_reason, device_label, browser_label
      FROM auth_sessions
      WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).all(accountId, now, limit) as SessionRow[];
    return rows.map(sessionFromRow);
  }
}
