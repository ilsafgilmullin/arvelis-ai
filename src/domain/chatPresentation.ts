import type { ChatAttachmentKind, DemoThread } from '../types';

export function conversationRelativeTime(timestamp: number, now = Date.now()): string {
  const delta = Math.max(0, now - timestamp);
  if (delta < 60_000) return 'только что';

  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} мин назад`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export function conversationMessageCount(thread: DemoThread): number {
  return thread.messages.reduce((count, message) => count + (message.role === 'system' ? 0 : 1), 0);
}

export function conversationMessageCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) return `${count} сообщений`;
  if (mod10 === 1) return `${count} сообщение`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} сообщения`;
  return `${count} сообщений`;
}

function attachmentPreview(kind: ChatAttachmentKind, count: number, name: string): string {
  const suffix = count > 1 ? ` · ещё ${count - 1}` : '';
  if (kind === 'audio') return `Голосовое сообщение${suffix}`;
  if (kind === 'image') return `Фото${suffix}`;
  if (kind === 'video') return `Видео${suffix}`;
  return `${name || 'Файл'}${suffix}`;
}

export function conversationPreview(thread: DemoThread, maxLength = 92): string {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role === 'system' || message.mock) continue;

    const normalized = message.content.replace(/\s+/g, ' ').trim();
    if (normalized) {
      if (normalized.length <= maxLength) return normalized;
      return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
    }

    const attachments = message.attachments ?? [];
    const first = attachments[0];
    if (first) return attachmentPreview(first.kind, attachments.length, first.name);
  }

  return 'Пустой диалог';
}
