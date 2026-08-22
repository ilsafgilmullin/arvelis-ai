import type { DatabaseSync } from 'node:sqlite';
import type {
  ChatRateLimitDecision,
  ChatRateLimitRequest,
  ChatRateLimitStore,
} from '../../chat/rateLimit';
import { inSqliteTransaction } from './database';

type RateLimitRow = {
  window_started_at: number;
  consumed_count: number;
  expires_at: number;
};

export class SqliteChatRateLimitStore implements ChatRateLimitStore {
  constructor(private readonly database: DatabaseSync) {}

  async consume(request: ChatRateLimitRequest): Promise<ChatRateLimitDecision> {
    return inSqliteTransaction(this.database, () => {
      const row = this.database.prepare(`
        SELECT window_started_at, consumed_count, expires_at
        FROM chat_rate_limits
        WHERE scope = ? AND account_id = ?
      `).get(request.scope, request.accountId) as RateLimitRow | undefined;

      if (!row) {
        this.database.prepare(`
          INSERT INTO chat_rate_limits (
            scope, account_id, window_started_at, consumed_count, expires_at
          ) VALUES (?, ?, ?, 1, ?)
        `).run(request.scope, request.accountId, request.now, request.now + request.windowMs);
        return { allowed: true };
      }

      if (request.now >= row.expires_at) {
        this.database.prepare(`
          UPDATE chat_rate_limits
          SET window_started_at = ?, consumed_count = 1, expires_at = ?
          WHERE scope = ? AND account_id = ?
        `).run(request.now, request.now + request.windowMs, request.scope, request.accountId);
        return { allowed: true };
      }

      if (row.consumed_count >= request.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((row.expires_at - request.now) / 1000)),
        };
      }

      this.database.prepare(`
        UPDATE chat_rate_limits
        SET consumed_count = consumed_count + 1
        WHERE scope = ? AND account_id = ?
      `).run(request.scope, request.accountId);
      return { allowed: true };
    });
  }
}
