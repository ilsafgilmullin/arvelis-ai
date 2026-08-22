import {
  CHAT_ATTACHMENT_KIND_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_COUNT,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../../shared/chatAttachmentLimits';
import type { ChatAttachmentKind, ChatAttachmentMeta } from '../types';

export { CHAT_ATTACHMENT_MAX_COUNT, CHAT_ATTACHMENT_MAX_TOTAL_BYTES };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export type AttachmentCandidate = ChatAttachmentMeta & { blob: Blob };

export function attachmentKindForMime(mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

export function normalizeAttachmentName(name: string, fallback = 'Файл'): string {
  const normalized = name.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 180);
}

export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} КБ`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`;
}

export function formatVoiceDuration(durationMs?: number): string {
  if (!durationMs || durationMs < 0) return '0:00';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function validateAttachmentCandidate(
  candidate: Pick<ChatAttachmentMeta, 'kind' | 'size'>,
): string | null {
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) return 'Пустой файл добавить нельзя.';
  const max = CHAT_ATTACHMENT_KIND_MAX_BYTES[candidate.kind];
  if (candidate.size > max) {
    return `${candidate.kind === 'video' ? 'Видео' : candidate.kind === 'image' ? 'Изображение' : candidate.kind === 'audio' ? 'Аудио' : 'Файл'} слишком большое. Максимум ${formatAttachmentSize(max)}.`;
  }
  return null;
}

export function validateAttachmentBatch(existing: ChatAttachmentMeta[], incoming: ChatAttachmentMeta[]): string | null {
  if (existing.length + incoming.length > CHAT_ATTACHMENT_MAX_COUNT) {
    return `Можно добавить не больше ${CHAT_ATTACHMENT_MAX_COUNT} вложений в одно сообщение.`;
  }
  const totalBytes = [...existing, ...incoming].reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > CHAT_ATTACHMENT_MAX_TOTAL_BYTES) {
    return `Общий размер вложений превышает ${formatAttachmentSize(CHAT_ATTACHMENT_MAX_TOTAL_BYTES)}.`;
  }
  return null;
}

export function isValidStoredAttachmentMeta(value: unknown): value is ChatAttachmentMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<ChatAttachmentMeta>;
  if (
    typeof item.id !== 'string'
    || !/^[A-Za-z0-9_-]{8,128}$/.test(item.id)
    || (item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio' && item.kind !== 'file')
    || typeof item.name !== 'string'
    || !item.name
    || item.name.length > 180
    || typeof item.mimeType !== 'string'
    || item.mimeType.length > 180
    || typeof item.size !== 'number'
    || !Number.isFinite(item.size)
    || item.size <= 0
    || typeof item.createdAt !== 'number'
    || !Number.isFinite(item.createdAt)
  ) return false;

  if (item.durationMs !== undefined && (typeof item.durationMs !== 'number' || !Number.isFinite(item.durationMs) || item.durationMs < 0)) {
    return false;
  }

  return validateAttachmentCandidate(item as ChatAttachmentMeta) === null;
}
