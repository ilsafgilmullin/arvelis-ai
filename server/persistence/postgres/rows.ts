import type { AccountRecord, EmailIdentityRecord } from '../../auth/account/contracts';
import type { EmailOtpChallengeRecord } from '../../auth/emailOtp/contracts';
import type { SessionRecord, SessionRevokeReason } from '../../auth/session/contracts';

export function timestamp(value: string | number, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid PostgreSQL timestamp field: ${field}`);
  }
  return parsed;
}

export type AccountRow = {
  id: string;
  display_name: string;
  status: AccountRecord['status'];
  security_version: number;
  created_at: string | number;
  updated_at: string | number;
};

export function accountFromRow(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    status: row.status,
    securityVersion: row.security_version,
    createdAt: timestamp(row.created_at, 'account.created_at'),
    updatedAt: timestamp(row.updated_at, 'account.updated_at'),
  };
}

export type EmailIdentityRow = {
  id: string;
  account_id: string;
  canonical_email: string;
  verified_at: string | number;
  linked_at: string | number;
  last_authenticated_at: string | number | null;
  disabled_at: string | number | null;
};

export function identityFromRow(row: EmailIdentityRow): EmailIdentityRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: 'email_otp',
    canonicalEmail: row.canonical_email,
    verifiedAt: timestamp(row.verified_at, 'identity.verified_at'),
    linkedAt: timestamp(row.linked_at, 'identity.linked_at'),
    lastAuthenticatedAt: row.last_authenticated_at === null ? null : timestamp(row.last_authenticated_at, 'identity.last_authenticated_at'),
    disabledAt: row.disabled_at === null ? null : timestamp(row.disabled_at, 'identity.disabled_at'),
  };
}

export type EmailOtpChallengeRow = {
  id: string;
  intent: EmailOtpChallengeRecord['intent'];
  email: string;
  code_mac: string;
  created_at: string | number;
  activated_at: string | number | null;
  expires_at: string | number;
  attempts: number;
  max_attempts: number;
  consumed_at: string | number | null;
  superseded_at: string | number | null;
};

export function challengeFromRow(row: EmailOtpChallengeRow): EmailOtpChallengeRecord {
  return {
    id: row.id,
    intent: row.intent,
    email: row.email,
    codeMac: row.code_mac,
    createdAt: timestamp(row.created_at, 'challenge.created_at'),
    activatedAt: row.activated_at === null ? null : timestamp(row.activated_at, 'challenge.activated_at'),
    expiresAt: timestamp(row.expires_at, 'challenge.expires_at'),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    consumedAt: row.consumed_at === null ? null : timestamp(row.consumed_at, 'challenge.consumed_at'),
    supersededAt: row.superseded_at === null ? null : timestamp(row.superseded_at, 'challenge.superseded_at'),
  };
}

export type SessionRow = {
  id: string;
  account_id: string;
  secret_mac: string;
  security_version: number;
  created_at: string | number;
  last_seen_at: string | number;
  expires_at: string | number;
  revoked_at: string | number | null;
  revoke_reason: SessionRevokeReason | null;
  device_label: string | null;
  browser_label: string | null;
};

export function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    secretMac: row.secret_mac,
    securityVersion: row.security_version,
    createdAt: timestamp(row.created_at, 'session.created_at'),
    lastSeenAt: timestamp(row.last_seen_at, 'session.last_seen_at'),
    expiresAt: timestamp(row.expires_at, 'session.expires_at'),
    revokedAt: row.revoked_at === null ? null : timestamp(row.revoked_at, 'session.revoked_at'),
    revokeReason: row.revoke_reason,
    deviceLabel: row.device_label,
    browserLabel: row.browser_label,
  };
}
