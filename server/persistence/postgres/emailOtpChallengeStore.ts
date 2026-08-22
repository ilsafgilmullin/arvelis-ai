import type { Pool, PoolClient } from 'pg';
import type {
  EmailOtpAttemptResult,
  EmailOtpChallengeRecord,
  EmailOtpChallengeStore,
} from '../../auth/emailOtp/contracts';
import { challengeFromRow, type EmailOtpChallengeRow } from './rows';

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original database failure.
  }
}

export class PostgresEmailOtpChallengeStore implements EmailOtpChallengeStore {
  constructor(private readonly pool: Pool) {}

  async createPending(record: EmailOtpChallengeRecord): Promise<void> {
    await this.pool.query(`
      INSERT INTO auth_email_otp_challenges (
        id, intent, email, code_mac, created_at, activated_at, expires_at,
        attempts, max_attempts, consumed_at, superseded_at
      ) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, NULL, NULL)
    `, [
      record.id,
      record.intent,
      record.email,
      record.codeMac,
      record.createdAt,
      record.expiresAt,
      record.attempts,
      record.maxAttempts,
    ]);
  }

  async activateReplacingActive(challengeId: string, activatedAt: number): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const target = await client.query<EmailOtpChallengeRow>(`
        SELECT id, intent, email, code_mac, created_at, activated_at, expires_at,
               attempts, max_attempts, consumed_at, superseded_at
        FROM auth_email_otp_challenges
        WHERE id = $1
        FOR UPDATE
      `, [challengeId]);
      const row = target.rows[0];
      if (!row || row.activated_at !== null || row.consumed_at !== null || row.superseded_at !== null) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query(`
        UPDATE auth_email_otp_challenges
        SET superseded_at = $3
        WHERE email = $1
          AND intent = $2
          AND id <> $4
          AND activated_at IS NOT NULL
          AND consumed_at IS NULL
          AND superseded_at IS NULL
      `, [row.email, row.intent, activatedAt, challengeId]);

      const activated = await client.query(`
        UPDATE auth_email_otp_challenges
        SET activated_at = $2
        WHERE id = $1
          AND activated_at IS NULL
          AND consumed_at IS NULL
          AND superseded_at IS NULL
      `, [challengeId, activatedAt]);
      await client.query('COMMIT');
      return activated.rowCount === 1;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(challengeId: string): Promise<void> {
    await this.pool.query(`
      DELETE FROM auth_email_otp_challenges
      WHERE id = $1 AND activated_at IS NULL AND consumed_at IS NULL AND superseded_at IS NULL
    `, [challengeId]);
  }

  async beginAttempt(challengeId: string, now: number): Promise<EmailOtpAttemptResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<EmailOtpChallengeRow>(`
        SELECT id, intent, email, code_mac, created_at, activated_at, expires_at,
               attempts, max_attempts, consumed_at, superseded_at
        FROM auth_email_otp_challenges
        WHERE id = $1
        FOR UPDATE
      `, [challengeId]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'missing' };
      }
      const record = challengeFromRow(row);
      if (record.activatedAt === null) {
        await client.query('ROLLBACK');
        return { status: 'pending' };
      }
      if (record.consumedAt !== null) {
        await client.query('ROLLBACK');
        return { status: 'consumed' };
      }
      if (record.supersededAt !== null) {
        await client.query('ROLLBACK');
        return { status: 'superseded' };
      }
      if (now >= record.expiresAt) {
        await client.query('ROLLBACK');
        return { status: 'expired' };
      }
      if (record.attempts >= record.maxAttempts) {
        await client.query('ROLLBACK');
        return { status: 'locked' };
      }

      const attemptNumber = record.attempts + 1;
      const updated = await client.query<EmailOtpChallengeRow>(`
        UPDATE auth_email_otp_challenges
        SET attempts = $2
        WHERE id = $1
        RETURNING id, intent, email, code_mac, created_at, activated_at, expires_at,
                  attempts, max_attempts, consumed_at, superseded_at
      `, [challengeId, attemptNumber]);
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new Error('OTP attempt update returned no row');
      await client.query('COMMIT');
      return { status: 'ready', record: challengeFromRow(updatedRow), attemptNumber };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async consume(challengeId: string, expectedAttemptNumber: number, consumedAt: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE auth_email_otp_challenges
      SET consumed_at = $3
      WHERE id = $1
        AND attempts = $2
        AND activated_at IS NOT NULL
        AND consumed_at IS NULL
        AND superseded_at IS NULL
        AND expires_at > $3
    `, [challengeId, expectedAttemptNumber, consumedAt]);
    return result.rowCount === 1;
  }
}
