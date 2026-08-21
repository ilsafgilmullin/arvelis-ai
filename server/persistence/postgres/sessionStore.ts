import type { Pool } from 'pg';
import type { SessionRecord, SessionRevokeReason, SessionStore } from '../../auth/session/contracts';
import { sessionFromRow, type SessionRow } from './rows';

export class PostgresSessionStore implements SessionStore {
  constructor(private readonly pool: Pool) {}

  async create(record: SessionRecord): Promise<void> {
    await this.pool.query(`
      INSERT INTO auth_sessions (
        id, account_id, secret_mac, security_version, created_at, last_seen_at,
        expires_at, revoked_at, revoke_reason, device_label, browser_label
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9)
    `, [
      record.id,
      record.accountId,
      record.secretMac,
      record.securityVersion,
      record.createdAt,
      record.lastSeenAt,
      record.expiresAt,
      record.deviceLabel,
      record.browserLabel,
    ]);
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<SessionRow>(`
      SELECT id, account_id, secret_mac, security_version, created_at, last_seen_at,
             expires_at, revoked_at, revoke_reason, device_label, browser_label
      FROM auth_sessions
      WHERE id = $1
      LIMIT 1
    `, [sessionId]);
    const row = result.rows[0];
    return row ? sessionFromRow(row) : null;
  }

  async touch(sessionId: string, accountId: string, seenAt: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE auth_sessions
      SET last_seen_at = $3
      WHERE id = $1
        AND account_id = $2
        AND revoked_at IS NULL
        AND expires_at > $3
    `, [sessionId, accountId, seenAt]);
    return result.rowCount === 1;
  }

  async revokeOwned(
    sessionId: string,
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE auth_sessions
      SET revoked_at = $3, revoke_reason = $4
      WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL
    `, [sessionId, accountId, revokedAt, reason]);
    return result.rowCount === 1;
  }

  async revokeAllForAccount(
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<number> {
    const result = await this.pool.query(`
      UPDATE auth_sessions
      SET revoked_at = $2, revoke_reason = $3
      WHERE account_id = $1 AND revoked_at IS NULL
    `, [accountId, revokedAt, reason]);
    return result.rowCount ?? 0;
  }

  async listForAccount(accountId: string, now: number, limit: number): Promise<SessionRecord[]> {
    const result = await this.pool.query<SessionRow>(`
      SELECT id, account_id, secret_mac, security_version, created_at, last_seen_at,
             expires_at, revoked_at, revoke_reason, device_label, browser_label
      FROM auth_sessions
      WHERE account_id = $1 AND revoked_at IS NULL AND expires_at > $2
      ORDER BY last_seen_at DESC
      LIMIT $3
    `, [accountId, now, limit]);
    return result.rows.map(sessionFromRow);
  }
}
