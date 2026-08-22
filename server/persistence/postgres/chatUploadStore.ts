import type { Pool, PoolClient } from 'pg';
import type {
  ChatStorageGcRecord,
  ChatStorageGcStore,
  ChatUploadRecord,
  ChatUploadStore,
  ReserveChatUploadInput,
  ReserveChatUploadResult,
} from '../../chat/attachments/contracts';

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original failure.
  }
}

function safeNumber(value: string | number, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid PostgreSQL upload field: ${field}`);
  return parsed;
}

type UploadRow = {
  id: string;
  account_id: string;
  kind: ChatUploadRecord['kind'];
  name: string;
  mime_type: string;
  size_bytes: string | number;
  duration_ms: string | number | null;
  storage_key: string;
  sha256: string | null;
  state: ChatUploadRecord['state'];
  created_at: string | number;
  expires_at: string | number;
};

type UsageRow = {
  window_started_at: string | number;
  upload_count: number;
  uploaded_bytes: string | number;
  expires_at: string | number;
};

type GcRow = {
  storage_key: string;
  queued_at: string | number;
  reason: ChatStorageGcRecord['reason'];
  attempts: number;
  last_attempt_at: string | number | null;
};

function uploadFromRow(row: UploadRow): ChatUploadRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: safeNumber(row.size_bytes, 'size_bytes'),
    durationMs: row.duration_ms === null ? null : safeNumber(row.duration_ms, 'duration_ms'),
    storageKey: row.storage_key,
    sha256: row.sha256,
    state: row.state,
    createdAt: safeNumber(row.created_at, 'created_at'),
    expiresAt: safeNumber(row.expires_at, 'expires_at'),
  };
}

function gcFromRow(row: GcRow): ChatStorageGcRecord {
  return {
    storageKey: row.storage_key,
    queuedAt: safeNumber(row.queued_at, 'gc.queued_at'),
    reason: row.reason,
    attempts: safeNumber(row.attempts, 'gc.attempts'),
    lastAttemptAt: row.last_attempt_at === null ? null : safeNumber(row.last_attempt_at, 'gc.last_attempt_at'),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class PostgresChatUploadStore implements ChatUploadStore, ChatStorageGcStore {
  constructor(private readonly pool: Pool) {}

  async reserve(input: ReserveChatUploadInput): Promise<ReserveChatUploadResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query(
        'SELECT id FROM auth_accounts WHERE id = $1 FOR UPDATE',
        [input.upload.accountId],
      );
      if (account.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'unavailable' };
      }

      const pendingResult = await client.query<{ count: string; bytes: string }>(`
        SELECT COUNT(*)::text AS count, COALESCE(SUM(size_bytes), 0)::text AS bytes
        FROM chat_uploads
        WHERE account_id = $1 AND expires_at > $2
      `, [input.upload.accountId, input.upload.createdAt]);
      const pending = pendingResult.rows[0];
      const pendingCount = pending ? safeNumber(pending.count, 'pending.count') : 0;
      const pendingBytes = pending ? safeNumber(pending.bytes, 'pending.bytes') : 0;
      if (pendingCount >= input.maxPendingUploads || pendingBytes + input.upload.sizeBytes > input.maxPendingBytes) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'pending_limit' };
      }

      const usageResult = await client.query<UsageRow>(`
        SELECT window_started_at, upload_count, uploaded_bytes, expires_at
        FROM chat_upload_usage
        WHERE account_id = $1
        FOR UPDATE
      `, [input.upload.accountId]);
      const usage = usageResult.rows[0];
      const now = input.upload.createdAt;
      if (usage && now < safeNumber(usage.expires_at, 'usage.expires_at')) {
        const uploadedBytes = safeNumber(usage.uploaded_bytes, 'usage.uploaded_bytes');
        if (usage.upload_count >= input.hourlyUploadLimit
          || uploadedBytes + input.upload.sizeBytes > input.hourlyByteLimit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((safeNumber(usage.expires_at, 'usage.expires_at') - now) / 1000));
          await client.query('ROLLBACK');
          return { ok: false, reason: 'rate_limited', retryAfterSeconds };
        }
        await client.query(`
          UPDATE chat_upload_usage
          SET upload_count = upload_count + 1, uploaded_bytes = uploaded_bytes + $2
          WHERE account_id = $1
        `, [input.upload.accountId, input.upload.sizeBytes]);
      } else {
        await client.query(`
          INSERT INTO chat_upload_usage (
            account_id, window_started_at, upload_count, uploaded_bytes, expires_at
          ) VALUES ($1, $2, 1, $3, $4)
          ON CONFLICT (account_id) DO UPDATE SET
            window_started_at = EXCLUDED.window_started_at,
            upload_count = 1,
            uploaded_bytes = EXCLUDED.uploaded_bytes,
            expires_at = EXCLUDED.expires_at
        `, [input.upload.accountId, now, input.upload.sizeBytes, now + input.usageWindowMs]);
      }

      await client.query(`
        INSERT INTO chat_uploads (
          id, account_id, kind, name, mime_type, size_bytes, duration_ms,
          storage_key, sha256, state, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, 'receiving', $9, $10)
      `, [
        input.upload.id,
        input.upload.accountId,
        input.upload.kind,
        input.upload.name,
        input.upload.mimeType,
        input.upload.sizeBytes,
        input.upload.durationMs,
        input.upload.storageKey,
        input.upload.createdAt,
        input.upload.expiresAt,
      ]);
      await client.query('COMMIT');
      return { ok: true };
    } catch (error) {
      await rollback(client);
      return { ok: false, reason: isUniqueViolation(error) ? 'conflict' : 'unavailable' };
    } finally {
      client.release();
    }
  }

  async markReady(
    accountId: string,
    uploadId: string,
    sha256: string,
    readyAt: number,
  ): Promise<ChatUploadRecord | null> {
    const result = await this.pool.query<UploadRow>(`
      UPDATE chat_uploads
      SET sha256 = $3, state = 'ready'
      WHERE id = $1 AND account_id = $2 AND state = 'receiving' AND expires_at > $4
      RETURNING id, account_id, kind, name, mime_type, size_bytes, duration_ms,
                storage_key, sha256, state, created_at, expires_at
    `, [uploadId, accountId, sha256, readyAt]);
    const row = result.rows[0];
    return row ? uploadFromRow(row) : null;
  }

  async abortAndQueue(
    accountId: string,
    uploadId: string,
    reason: ChatStorageGcRecord['reason'],
    now: number,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ storage_key: string }>(`
        SELECT storage_key FROM chat_uploads
        WHERE id = $1 AND account_id = $2
        FOR UPDATE
      `, [uploadId, accountId]);
      const row = result.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(`
        INSERT INTO chat_storage_gc (storage_key, queued_at, reason, attempts, last_attempt_at)
        VALUES ($1, $2, $3, 0, NULL)
        ON CONFLICT (storage_key) DO NOTHING
      `, [row.storage_key, now, reason]);
      await client.query('DELETE FROM chat_uploads WHERE id = $1 AND account_id = $2', [uploadId, accountId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async expireAndQueue(now: number, limit: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; storage_key: string }>(`
        SELECT id, storage_key
        FROM chat_uploads
        WHERE expires_at <= $1
        ORDER BY expires_at ASC, id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `, [now, limit]);
      for (const row of result.rows) {
        await client.query(`
          INSERT INTO chat_storage_gc (storage_key, queued_at, reason, attempts, last_attempt_at)
          VALUES ($1, $2, 'expired_upload', 0, NULL)
          ON CONFLICT (storage_key) DO NOTHING
        `, [row.storage_key, now]);
        await client.query('DELETE FROM chat_uploads WHERE id = $1', [row.id]);
      }
      await client.query('COMMIT');
      return result.rows.length;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async listPending(limit: number): Promise<ChatStorageGcRecord[]> {
    const result = await this.pool.query<GcRow>(`
      SELECT storage_key, queued_at, reason, attempts, last_attempt_at
      FROM chat_storage_gc
      ORDER BY queued_at ASC, storage_key ASC
      LIMIT $1
    `, [limit]);
    return result.rows.map(gcFromRow);
  }

  async recordAttempt(storageKey: string, attemptedAt: number): Promise<void> {
    await this.pool.query(`
      UPDATE chat_storage_gc
      SET attempts = attempts + 1, last_attempt_at = $2
      WHERE storage_key = $1
    `, [storageKey, attemptedAt]);
  }

  async remove(storageKey: string): Promise<void> {
    await this.pool.query('DELETE FROM chat_storage_gc WHERE storage_key = $1', [storageKey]);
  }
}
