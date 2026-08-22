import { messageAttachments, messageText } from '../chat/domain';
import type { Conversation } from '../types';

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

export function conversationMessageCount(conversation: Conversation): number {
  return conversation.messages.reduce((count, message) => count + (message.role === 'system' ? 0 : 1), 0);
}

export function conversationMessageCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) return `${count} сообщений`;
  if (mod10 === 1) return `${count} сообщение`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} сообщения`;
  return `${count} сообщений`;
}

function attachmentPreview(conversation: Conversation): string | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (!message || message.role === 'system') continue;

    const attachments = messageAttachments(message);
    const first = attachments[0];
    if (!first) continue;

    if (first.kind === 'audio') return 'Голосовое сообщение';
    if (first.kind === 'image') return attachments.length > 1 ? `Фото · ${attachments.length}` : 'Фото';
    if (first.kind === 'video') return attachments.length > 1 ? `Видео · ${attachments.length}` : 'Видео';
    return first.name || 'Файл';
  }

  return null;
}

export function conversationPreview(conversation: Conversation, maxLength = 92): string {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (!message || message.role === 'system') continue;

    const normalized = messageText(message).replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
  }

  return attachmentPreview(conversation) ?? 'Пустой диалог';
}
