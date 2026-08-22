import type { ServerChatAttachmentKind } from '../contracts';

export type ChatUploadState = 'receiving' | 'ready';
export type ChatStorageGcReason = 'expired_upload' | 'conversation_delete' | 'upload_failed';

export type ChatUploadRecord = {
  id: string;
  accountId: string;
  kind: ServerChatAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  storageKey: string;
  sha256: string | null;
  state: ChatUploadState;
  createdAt: number;
  expiresAt: number;
};

export type ReserveChatUploadInput = {
  upload: ChatUploadRecord;
  hourlyUploadLimit: number;
  hourlyByteLimit: number;
  usageWindowMs: number;
  maxPendingUploads: number;
  maxPendingBytes: number;
};

export type ReserveChatUploadResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'rate_limited' | 'pending_limit' | 'conflict' | 'unavailable';
      retryAfterSeconds?: number;
    };

export type ChatStorageGcRecord = {
  storageKey: string;
  queuedAt: number;
  reason: ChatStorageGcReason;
  attempts: number;
  lastAttemptAt: number | null;
};

export interface ChatUploadStore {
  reserve(input: ReserveChatUploadInput): Promise<ReserveChatUploadResult>;
  markReady(
    accountId: string,
    uploadId: string,
    completion: { sha256: string; mimeType: string; readyAt: number },
  ): Promise<ChatUploadRecord | null>;
  abortAndQueue(accountId: string, uploadId: string, reason: ChatStorageGcReason, now: number): Promise<boolean>;
  expireAndQueue(now: number, limit: number): Promise<number>;
}

export interface ChatStorageGcStore {
  listPending(limit: number): Promise<ChatStorageGcRecord[]>;
  recordAttempt(storageKey: string, attemptedAt: number): Promise<void>;
  remove(storageKey: string): Promise<void>;
}

export type ChatObjectWriteResult = {
  sizeBytes: number;
  sha256: string;
  head: Uint8Array;
};

export type ChatObjectReadResult = {
  stream: AsyncIterable<Uint8Array>;
  sizeBytes: number;
};

export interface ChatObjectStorage {
  write(input: {
    storageKey: string;
    source: AsyncIterable<Uint8Array>;
    expectedBytes: number;
    maxBytes: number;
    headBytes: number;
  }): Promise<ChatObjectWriteResult>;
  read(storageKey: string, range?: { start: number; endInclusive: number }): Promise<ChatObjectReadResult | null>;
  delete(storageKey: string): Promise<void>;
}
