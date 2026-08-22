import { randomBytes } from 'node:crypto';
import type {
  ChatConversationRecord,
  ChatConversationSummaryRecord,
  ChatMessageRecord,
  ServerConversationStore,
} from './contracts';

export const SERVER_CHAT_MAX_CONVERSATIONS = 100;
export const SERVER_CHAT_MAX_MESSAGES_PER_CONVERSATION = 500;
export const SERVER_CHAT_MESSAGE_MAX_CHARS = 6000;
export const SERVER_CHAT_TITLE_MAX_CHARS = 80;
export const SERVER_CHAT_LIST_MAX = 50;
export const SERVER_CHAT_MESSAGE_PAGE_MAX = 100;

const ID_PATTERN = /^[a-f0-9]{32}$/;

type ServiceFailureCode =
  | 'invalid_input'
  | 'not_found'
  | 'conversation_limit'
  | 'message_limit'
  | 'conflict'
  | 'service_unavailable';

export type ChatServiceFailure = { ok: false; code: ServiceFailureCode };

export type ConversationListPage = {
  items: ChatConversationSummaryRecord[];
  nextCursor: string | null;
};

export type ConversationDetailPage = {
  conversation: ChatConversationRecord;
  messages: ChatMessageRecord[];
  nextMessageCursor: string | null;
};

function createId(): string {
  return randomBytes(16).toString('hex');
}

function normalizeContent(value: string): string {
  return value.trim().slice(0, SERVER_CHAT_MESSAGE_MAX_CHARS);
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, SERVER_CHAT_TITLE_MAX_CHARS);
}

function titleFromContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (compact.length <= 52) return compact;
  return `${compact.slice(0, 49)}…`;
}

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function encodeConversationCursor(updatedAt: number, id: string): string {
  return Buffer.from(`${updatedAt}:${id}`, 'utf8').toString('base64url');
}

function decodeConversationCursor(cursor: string | undefined): { updatedAt: number; id: string } | undefined {
  if (!cursor || cursor.length > 160) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator <= 0) return undefined;
    const updatedAt = Number(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (!Number.isSafeInteger(updatedAt) || updatedAt < 0 || !ID_PATTERN.test(id)) return undefined;
    return { updatedAt, id };
  } catch {
    return undefined;
  }
}

function encodeMessageCursor(position: number): string {
  return Buffer.from(String(position), 'utf8').toString('base64url');
}

function decodeMessageCursor(cursor: string | undefined): number | undefined {
  if (!cursor || cursor.length > 32) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const position = Number(decoded);
    return Number.isInteger(position) && position >= 0 ? position : undefined;
  } catch {
    return undefined;
  }
}

export class ChatApplicationService {
  constructor(
    private readonly store: ServerConversationStore,
    private readonly now: () => number = Date.now,
  ) {}

  async listConversations(accountId: string, options?: { limit?: number; cursor?: string })
    : Promise<{ ok: true; page: ConversationListPage } | ChatServiceFailure> {
    const limit = normalizeLimit(options?.limit, 20, SERVER_CHAT_LIST_MAX);
    const before = options?.cursor ? decodeConversationCursor(options.cursor) : undefined;
    if (options?.cursor && !before) return { ok: false, code: 'invalid_input' };

    try {
      const items = await this.store.listConversations({ accountId, limit, ...(before ? { before } : {}) });
      const last = items.length === limit ? items.at(-1) : undefined;
      return {
        ok: true,
        page: {
          items,
          nextCursor: last ? encodeConversationCursor(last.updatedAt, last.id) : null,
        },
      };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async getConversation(accountId: string, conversationId: string, options?: { messageLimit?: number; messageCursor?: string })
    : Promise<{ ok: true; page: ConversationDetailPage } | ChatServiceFailure> {
    if (!ID_PATTERN.test(conversationId)) return { ok: false, code: 'not_found' };
    const limit = normalizeLimit(options?.messageLimit, 60, SERVER_CHAT_MESSAGE_PAGE_MAX);
    const beforePosition = options?.messageCursor ? decodeMessageCursor(options.messageCursor) : undefined;
    if (options?.messageCursor && beforePosition === undefined) return { ok: false, code: 'invalid_input' };

    try {
      const conversation = await this.store.getConversation(accountId, conversationId);
      if (!conversation) return { ok: false, code: 'not_found' };
      const messages = await this.store.listMessages({
        accountId,
        conversationId,
        limit,
        ...(beforePosition === undefined ? {} : { beforePosition }),
      });
      const oldest = messages.length === limit ? messages[0] : undefined;
      return {
        ok: true,
        page: {
          conversation,
          messages,
          nextMessageCursor: oldest && oldest.position > 0 ? encodeMessageCursor(oldest.position) : null,
        },
      };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async createConversation(accountId: string, rawContent: string)
    : Promise<{ ok: true; conversation: ChatConversationRecord; message: ChatMessageRecord } | ChatServiceFailure> {
    const content = normalizeContent(rawContent);
    if (!content) return { ok: false, code: 'invalid_input' };
    const createdAt = this.now();
    const conversationId = createId();
    const messageId = createId();
    const conversation: ChatConversationRecord = {
      id: conversationId,
      accountId,
      title: titleFromContent(content),
      modelPreference: null,
      createdAt,
      updatedAt: createdAt,
      version: 1,
    };
    const message: ChatMessageRecord = {
      id: messageId,
      conversationId,
      role: 'user',
      status: 'completed',
      content,
      position: 0,
      createdAt,
      editedAt: null,
      attachments: [],
    };

    try {
      const result = await this.store.createConversationWithUserMessage({
        conversation,
        message,
        maxConversations: SERVER_CHAT_MAX_CONVERSATIONS,
      });
      if (result.ok) return result;
      return { ok: false, code: result.reason === 'unavailable' ? 'service_unavailable' : result.reason };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async appendUserMessage(accountId: string, conversationId: string, rawContent: string)
    : Promise<{ ok: true; conversation: ChatConversationRecord; message: ChatMessageRecord } | ChatServiceFailure> {
    if (!ID_PATTERN.test(conversationId)) return { ok: false, code: 'not_found' };
    const content = normalizeContent(rawContent);
    if (!content) return { ok: false, code: 'invalid_input' };
    const createdAt = this.now();
    const message: Omit<ChatMessageRecord, 'position'> = {
      id: createId(),
      conversationId,
      role: 'user',
      status: 'completed',
      content,
      createdAt,
      editedAt: null,
      attachments: [],
    };

    try {
      const result = await this.store.appendUserMessage({
        accountId,
        conversationId,
        message,
        maxMessages: SERVER_CHAT_MAX_MESSAGES_PER_CONVERSATION,
      });
      if (result.ok) return result;
      return { ok: false, code: result.reason === 'unavailable' ? 'service_unavailable' : result.reason };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async updateUserMessage(accountId: string, conversationId: string, messageId: string, rawContent: string)
    : Promise<{ ok: true; conversation: ChatConversationRecord; message: ChatMessageRecord } | ChatServiceFailure> {
    if (!ID_PATTERN.test(conversationId) || !ID_PATTERN.test(messageId)) return { ok: false, code: 'not_found' };
    const content = normalizeContent(rawContent);
    if (!content) return { ok: false, code: 'invalid_input' };

    try {
      const result = await this.store.updateUserMessage({
        accountId,
        conversationId,
        messageId,
        content,
        editedAt: this.now(),
      });
      if (result.ok) return result;
      return { ok: false, code: result.reason === 'unavailable' ? 'service_unavailable' : result.reason };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async renameConversation(accountId: string, conversationId: string, rawTitle: string)
    : Promise<{ ok: true; conversation: ChatConversationRecord } | ChatServiceFailure> {
    if (!ID_PATTERN.test(conversationId)) return { ok: false, code: 'not_found' };
    const title = normalizeTitle(rawTitle);
    if (!title) return { ok: false, code: 'invalid_input' };

    try {
      const result = await this.store.renameConversation({
        accountId,
        conversationId,
        title,
        updatedAt: this.now(),
      });
      if (result.ok) return result;
      return { ok: false, code: result.reason === 'unavailable' ? 'service_unavailable' : result.reason };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }

  async deleteConversation(accountId: string, conversationId: string)
    : Promise<{ ok: true; deleted: boolean } | ChatServiceFailure> {
    if (!ID_PATTERN.test(conversationId)) return { ok: true, deleted: false };
    try {
      const result = await this.store.deleteConversation(accountId, conversationId);
      return result.ok ? result : { ok: false, code: 'service_unavailable' };
    } catch {
      return { ok: false, code: 'service_unavailable' };
    }
  }
}
