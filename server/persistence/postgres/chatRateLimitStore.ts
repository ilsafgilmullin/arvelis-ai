import type { Pool } from 'pg';
import type {
  ChatRateLimitDecision,
  ChatRateLimitRequest,
  ChatRateLimitStore,
} from '../../chat/rateLimit';

type RateLimitRow = {
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
    const result = await this.pool.query<RateLimitRow>(`
      INSERT INTO chat_rate_limits (
        scope, account_id, window_started_at, consumed_count, expires_at
      ) VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT (scope, account_id) DO UPDATE
      SET
        window_started_at = CASE
          WHEN chat_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.window_started_at
          ELSE chat_rate_limits.window_started_at
        END,
        consumed_count = CASE
          WHEN chat_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN 1
          ELSE LEAST(chat_rate_limits.consumed_count + 1, $5 + 1)
        END,
        expires_at = CASE
          WHEN chat_rate_limits.expires_at <= EXCLUDED.window_started_at
            THEN EXCLUDED.expires_at
          ELSE chat_rate_limits.expires_at
        END
      RETURNING consumed_count, expires_at
    `, [
      request.scope,
      request.accountId,
      request.now,
      request.now + request.windowMs,
      request.limit,
    ]);

    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL Chat rate-limit UPSERT returned no row');
    const consumedCount = Number(row.consumed_count);
    const expiresAt = asSafeInteger(row.expires_at, 'expires_at');
    if (!Number.isSafeInteger(consumedCount) || consumedCount < 1) {
      throw new Error('Invalid PostgreSQL Chat rate-limit field: consumed_count');
    }

    if (consumedCount <= request.limit) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - request.now) / 1000)),
    };
  }
}
