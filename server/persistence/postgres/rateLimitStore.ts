import type { Pool, PoolClient } from 'pg';
import type {
  EmailOtpRateLimitDecision,
  EmailOtpRateLimitPort,
  EmailOtpRateLimitRequest,
} from '../../auth/emailOtp/contracts';

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original database failure.
  }
}

type RateLimitRow = {
  window_started_at: string | number;
  consumed_count: number;
  expires_at: string | number;
};

function asNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid rate-limit timestamp');
  return parsed;
}

export class PostgresEmailOtpRateLimitStore implements EmailOtpRateLimitPort {
  constructor(private readonly pool: Pool) {}

  async consume(request: EmailOtpRateLimitRequest): Promise<EmailOtpRateLimitDecision> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<RateLimitRow>(`
        SELECT window_started_at, consumed_count, expires_at
        FROM auth_rate_limits
        WHERE scope = $1 AND key_hash = $2
        FOR UPDATE
      `, [request.scope, request.key]);
      const row = result.rows[0];

      if (!row) {
        await client.query(`
          INSERT INTO auth_rate_limits (scope, key_hash, window_started_at, consumed_count, expires_at)
          VALUES ($1, $2, $3, 1, $4)
        `, [request.scope, request.key, request.now, request.now + request.windowMs]);
        await client.query('COMMIT');
        return { allowed: true };
      }

      const windowStartedAt = asNumber(row.window_started_at);
      const windowEndsAt = windowStartedAt + request.windowMs;
      if (request.now >= windowEndsAt) {
        await client.query(`
          UPDATE auth_rate_limits
          SET window_started_at = $3, consumed_count = 1, expires_at = $4
          WHERE scope = $1 AND key_hash = $2
        `, [request.scope, request.key, request.now, request.now + request.windowMs]);
        await client.query('COMMIT');
        return { allowed: true };
      }

      if (row.consumed_count >= request.limit) {
        await client.query('COMMIT');
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - request.now) / 1000)),
        };
      }

      await client.query(`
        UPDATE auth_rate_limits
        SET consumed_count = consumed_count + 1, expires_at = $3
        WHERE scope = $1 AND key_hash = $2
      `, [request.scope, request.key, windowEndsAt]);
      await client.query('COMMIT');
      return { allowed: true };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
