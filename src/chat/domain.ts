import type {
  ChatAttachmentMeta,
  ChatMessage,
  ChatMessagePart,
  ChatMessageStatus,
  Conversation,
} from '../types';

export const DEFAULT_CONVERSATION_TITLE = 'Новый диалог';

export function messageText(message: ChatMessage): string {
  return message.content.trim();
}

export function messageAttachments(message: ChatMessage): readonly ChatAttachmentMeta[] {
  return message.attachments ?? [];
}

export function messageParts(message: ChatMessage): ChatMessagePart[] {
  const parts: ChatMessagePart[] = [];
  const text = messageText(message);
  if (text) parts.push({ type: 'text', text });
  for (const attachment of messageAttachments(message)) {
    parts.push({ type: 'attachment', attachment });
  }
  return parts;
}

/**
 * Legacy system/mock records can still be read by the browser migration layer,
 * but they are never part of the user-visible conversation domain.
 */
export function isRenderableChatMessage(message: ChatMessage): boolean {
  if (message.role === 'system') return false;
  if (message.role === 'assistant' && message.mock === true) return false;
  return messageParts(message).length > 0;
}

export function renderableMessages(conversation: Conversation | null | undefined): ChatMessage[] {
  return (conversation?.messages ?? []).filter(isRenderableChatMessage);
}

export function conversationAttachmentIds(conversation: Conversation | null | undefined): string[] {
  if (!conversation) return [];
  return conversation.messages.flatMap((message) => messageAttachments(message).map((attachment) => attachment.id));
}

export function conversationTitleFromMessage(content: string, attachments: readonly ChatAttachmentMeta[]): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized) return normalized.length > 52 ? `${normalized.slice(0, 49)}…` : normalized;

  const first = attachments[0];
  if (!first) return DEFAULT_CONVERSATION_TITLE;
  if (first.kind === 'audio') return 'Голосовое сообщение';

  const name = first.name.replace(/\s+/g, ' ').trim();
  if (!name) return DEFAULT_CONVERSATION_TITLE;
  return name.length > 52 ? `${name.slice(0, 49)}…` : name;
}

export function createLocalUserMessage({
  id,
  content,
  attachments = [],
  createdAt = Date.now(),
}: {
  id: string;
  content: string;
  attachments?: ChatAttachmentMeta[];
  createdAt?: number;
}): ChatMessage {
  const normalizedContent = content.trim();
  return {
    id,
    role: 'user',
    content: normalizedContent,
    createdAt,
    status: 'local',
    ...(attachments.length ? { attachments } : {}),
  };
}

export function createConversation({
  id,
  message,
  createdAt = message.createdAt,
}: {
  id: string;
  message: ChatMessage;
  createdAt?: number;
}): Conversation {
  return {
    id,
    title: conversationTitleFromMessage(message.content, messageAttachments(message)),
    createdAt,
    updatedAt: createdAt,
    messages: [message],
    modelPreference: null,
  };
}

export function withMessageStatus(message: ChatMessage, status: ChatMessageStatus): ChatMessage {
  return message.status === status ? message : { ...message, status };
}
