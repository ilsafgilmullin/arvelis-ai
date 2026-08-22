import type { DatabaseSync } from 'node:sqlite';
import type {
  ChatStorageGcRecord,
  ChatStorageGcStore,
  ChatUploadRecord,
  ChatUploadStore,
  ReserveChatUploadInput,
  ReserveChatUploadResult,
} from '../../chat/attachments/contracts';
import { inSqliteTransaction } from './database';

type UploadRow = {
  id: string;
  account_id: string;
  kind: ChatUploadRecord['kind'];
  name: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  storage_key: string;
  sha256: string | null;
  state: ChatUploadRecord['state'];
  created_at: number;
  expires_at: number;
};

type UsageRow = {
  window_started_at: number;
  upload_count: number;
  uploaded_bytes: number;
  expires_at: number;
};

type GcRow = {
  storage_key: string;
  queued_at: number;
  reason: ChatStorageGcRecord['reason'];
  attempts: number;
  last_attempt_at: number | null;
};

function uploadFromRow(row: UploadRow): ChatUploadRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    storageKey: row.storage_key,
    sha256: row.sha256,
    state: row.state,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  };
}

function gcFromRow(row: GcRow): ChatStorageGcRecord {
  return {
    storageKey: row.storage_key,
    queuedAt: Number(row.queued_at),
    reason: row.reason,
    attempts: Number(row.attempts),
    lastAttemptAt: row.last_attempt_at === null ? null : Number(row.last_attempt_at),
  };
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique/i.test(error.message);
}

export class SqliteChatUploadStore implements ChatUploadStore, ChatStorageGcStore {
  constructor(private readonly database: DatabaseSync) {}

  async reserve(input: ReserveChatUploadInput): Promise<ReserveChatUploadResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const now = input.upload.createdAt;
        const pending = this.database.prepare(`
          SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
          FROM chat_uploads
          WHERE account_id = ? AND expires_at > ?
        `).get(input.upload.accountId, now) as { count: number; bytes: number };
        if (Number(pending.count) >= input.maxPendingUploads
          || Number(pending.bytes) + input.upload.sizeBytes > input.maxPendingBytes) {
          return { ok: false as const, reason: 'pending_limit' as const };
        }

        const usage = this.database.prepare(`
          SELECT window_started_at, upload_count, uploaded_bytes, expires_at
          FROM chat_upload_usage
          WHERE account_id = ?
        `).get(input.upload.accountId) as UsageRow | undefined;

        if (usage && now < usage.expires_at) {
          if (usage.upload_count >= input.hourlyUploadLimit
            || usage.uploaded_bytes + input.upload.sizeBytes > input.hourlyByteLimit) {
            return {
              ok: false as const,
              reason: 'rate_limited' as const,
              retryAfterSeconds: Math.max(1, Math.ceil((usage.expires_at - now) / 1000)),
            };
          }
          this.database.prepare(`
            UPDATE chat_upload_usage
            SET upload_count = upload_count + 1, uploaded_bytes = uploaded_bytes + ?
            WHERE account_id = ?
          `).run(input.upload.sizeBytes, input.upload.accountId);
        } else {
          this.database.prepare(`
            INSERT INTO chat_upload_usage (
              account_id, window_started_at, upload_count, uploaded_bytes, expires_at
            ) VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET
              window_started_at = excluded.window_started_at,
              upload_count = 1,
              uploaded_bytes = excluded.uploaded_bytes,
              expires_at = excluded.expires_at
          `).run(
            input.upload.accountId,
            now,
            input.upload.sizeBytes,
            now + input.usageWindowMs,
          );
        }

        this.database.prepare(`
          INSERT INTO chat_uploads (
            id, account_id, kind, name, mime_type, size_bytes, duration_ms,
            storage_key, sha256, state, created_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'receiving', ?, ?)
        `).run(
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
        );
        return { ok: true as const };
      });
    } catch (error) {
      return { ok: false, reason: isConstraintError(error) ? 'conflict' : 'unavailable' };
    }
  }

  async markReady(
    accountId: string,
    uploadId: string,
    completion: { sha256: string; mimeType: string; readyAt: number },
  ): Promise<ChatUploadRecord | null> {
    const result = this.database.prepare(`
      UPDATE chat_uploads
      SET sha256 = ?, mime_type = ?, state = 'ready'
      WHERE id = ? AND account_id = ? AND state = 'receiving' AND expires_at > ?
    `).run(completion.sha256, completion.mimeType, uploadId, accountId, completion.readyAt);
    if (result.changes !== 1) return null;
    const row = this.database.prepare(`
      SELECT id, account_id, kind, name, mime_type, size_bytes, duration_ms,
             storage_key, sha256, state, created_at, expires_at
      FROM chat_uploads WHERE id = ? AND account_id = ?
    `).get(uploadId, accountId) as UploadRow | undefined;
    return row ? uploadFromRow(row) : null;
  }

  async abortAndQueue(
    accountId: string,
    uploadId: string,
    reason: ChatStorageGcRecord['reason'],
    now: number,
  ): Promise<boolean> {
    return inSqliteTransaction(this.database, () => {
      const row = this.database.prepare(
        'SELECT storage_key FROM chat_uploads WHERE id = ? AND account_id = ?',
      ).get(uploadId, accountId) as { storage_key: string } | undefined;
      if (!row) return false;
      this.database.prepare(`
        INSERT INTO chat_storage_gc (storage_key, queued_at, reason, attempts, last_attempt_at)
        VALUES (?, ?, ?, 0, NULL)
        ON CONFLICT(storage_key) DO NOTHING
      `).run(row.storage_key, now, reason);
      this.database.prepare('DELETE FROM chat_uploads WHERE id = ? AND account_id = ?').run(uploadId, accountId);
      return true;
    });
  }

  async expireAndQueue(now: number, limit: number): Promise<number> {
    return inSqliteTransaction(this.database, () => {
      const rows = this.database.prepare(`
        SELECT id, storage_key
        FROM chat_uploads
        WHERE expires_at <= ?
        ORDER BY expires_at ASC, id ASC
        LIMIT ?
      `).all(now, limit) as Array<{ id: string; storage_key: string }>;
      for (const row of rows) {
        this.database.prepare(`
          INSERT INTO chat_storage_gc (storage_key, queued_at, reason, attempts, last_attempt_at)
          VALUES (?, ?, 'expired_upload', 0, NULL)
          ON CONFLICT(storage_key) DO NOTHING
        `).run(row.storage_key, now);
        this.database.prepare('DELETE FROM chat_uploads WHERE id = ?').run(row.id);
      }
      return rows.length;
    });
  }

  async listPending(limit: number): Promise<ChatStorageGcRecord[]> {
    const rows = this.database.prepare(`
      SELECT storage_key, queued_at, reason, attempts, last_attempt_at
      FROM chat_storage_gc
      ORDER BY queued_at ASC, storage_key ASC
      LIMIT ?
    `).all(limit) as GcRow[];
    return rows.map(gcFromRow);
  }

  async recordAttempt(storageKey: string, attemptedAt: number): Promise<void> {
    this.database.prepare(`
      UPDATE chat_storage_gc
      SET attempts = attempts + 1, last_attempt_at = ?
      WHERE storage_key = ?
    `).run(attemptedAt, storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    this.database.prepare('DELETE FROM chat_storage_gc WHERE storage_key = ?').run(storageKey);
  }
}
