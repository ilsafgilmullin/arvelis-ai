import type { Pool, PoolClient } from 'pg';
import type {
  ChatRateLimitDecision,
  ChatRateLimitRequest,
  ChatRateLimitStore,
} from '../../chat/rateLimit';

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

function asSafeInteger(value: string | number, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid PostgreSQL Chat rate-limit field: ${field}`);
  }
  return parsed;
}

export class PostgresChatRateLimitStore implements ChatRateLimitStore {
  constructor(private readonly pool: Pool) {}

  async consume(request: ChatRateLimitRequest): Promise<ChatRateLimitDecision> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<RateLimitRow>(`
        SELECT window_started_at, consumed_count, expires_at
        FROM chat_rate_limits
        WHERE scope = $1 AND account_id = $2
        FOR UPDATE
      `, [request.scope, request.accountId]);
      const row = existing.rows[0];

      if (!row) {
        await client.query(`
          INSERT INTO chat_rate_limits (
            scope, account_id, window_started_at, consumed_count, expires_at
          ) VALUES ($1, $2, $3, 1, $4)
        `, [request.scope, request.accountId, request.now, request.now + request.windowMs]);
        await client.query('COMMIT');
        return { allowed: true };
      }

      const expiresAt = asSafeInteger(row.expires_at, 'expires_at');
      if (request.now >= expiresAt) {
        await client.query(`
          UPDATE chat_rate_limits
          SET window_started_at = $3, consumed_count = 1, expires_at = $4
          WHERE scope = $1 AND account_id = $2
        `, [request.scope, request.accountId, request.now, request.now + request.windowMs]);
        await client.query('COMMIT');
        return { allowed: true };
      }

      if (row.consumed_count >= request.limit) {
        await client.query('COMMIT');
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - request.now) / 1000)),
        };
      }

      await client.query(`
        UPDATE chat_rate_limits
        SET consumed_count = consumed_count + 1
        WHERE scope = $1 AND account_id = $2
      `, [request.scope, request.accountId]);
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
