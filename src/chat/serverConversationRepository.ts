import type {
  ChatAttachmentKind,
  ChatAttachmentMeta,
  ChatAttachmentStorageState,
  ChatMessage,
  ChatMessageRole,
  ChatMessageStatus,
  ConversationMetadata,
  ConversationSummary,
} from '../types';
import type {
  AppendMessageInput,
  ChatMutationResult,
  ConversationListOptions,
  ConversationListPage,
  ConversationMessagePage,
  ConversationMessagePageOptions,
  ConversationRepository,
  CreateConversationInput,
  UpdateMessageInput,
} from './repository';

export type ServerChatRepositoryErrorCode =
  | 'authentication_required'
  | 'invalid_input'
  | 'not_found'
  | 'conversation_limit'
  | 'message_limit'
  | 'conflict'
  | 'attachments_not_ready'
  | 'models_not_ready'
  | 'service_unavailable'
  | 'network_error'
  | 'invalid_response';

export class ServerChatRepositoryError extends Error {
  constructor(
    readonly code: ServerChatRepositoryErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ServerChatRepositoryError';
  }
}

type JsonRecord = Record<string, unknown>;

const ID_PATTERN = /^[a-f0-9]{32}$/;
const MESSAGE_ROLES = new Set<ChatMessageRole>(['user', 'assistant', 'system']);
const MESSAGE_STATUSES = new Set<ChatMessageStatus>(['pending', 'sending', 'streaming', 'completed', 'failed', 'cancelled']);
const ATTACHMENT_KINDS = new Set<ChatAttachmentKind>(['image', 'video', 'audio', 'file']);
const ATTACHMENT_STATES = new Set<ChatAttachmentStorageState>(['pending', 'ready', 'failed']);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maxLength: number): string {
  const value = record[key];
  if (typeof value !== 'string' || !value || value.length > maxLength) throw invalidResponse(`Invalid ${key}`);
  return value;
}

function nullableString(record: JsonRecord, key: string, maxLength: number): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > maxLength) throw invalidResponse(`Invalid ${key}`);
  return value;
}

function safeInteger(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalidResponse(`Invalid ${key}`);
  return value;
}

function nullableSafeInteger(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalidResponse(`Invalid ${key}`);
  return value;
}

function validId(record: JsonRecord, key: string): string {
  const value = requiredString(record, key, 32);
  if (!ID_PATTERN.test(value)) throw invalidResponse(`Invalid ${key}`);
  return value;
}

function invalidResponse(message: string): ServerChatRepositoryError {
  return new ServerChatRepositoryError('invalid_response', message);
}

function parseConversationMetadata(value: unknown): ConversationMetadata & { version: number } {
  if (!isRecord(value)) throw invalidResponse('Invalid conversation payload');
  const createdAt = safeInteger(value, 'createdAt');
  const updatedAt = safeInteger(value, 'updatedAt');
  if (updatedAt < createdAt) throw invalidResponse('Conversation timestamps are inconsistent');
  const modelPreference = nullableString(value, 'modelPreference', 160);
  return {
    id: validId(value, 'id'),
    title: requiredString(value, 'title', 160),
    createdAt,
    updatedAt,
    modelPreference,
    version: safeInteger(value, 'version'),
  };
}

function parseConversationSummary(value: unknown): ConversationSummary {
  if (!isRecord(value)) throw invalidResponse('Invalid conversation summary');
  const metadata = parseConversationMetadata(value);
  const latestMessageContent = value.latestMessageContent;
  if (latestMessageContent !== null && typeof latestMessageContent !== 'string') {
    throw invalidResponse('Invalid latestMessageContent');
  }
  const latestAttachmentKind = value.latestAttachmentKind;
  if (latestAttachmentKind !== null
    && (typeof latestAttachmentKind !== 'string' || !ATTACHMENT_KINDS.has(latestAttachmentKind as ChatAttachmentKind))) {
    throw invalidResponse('Invalid latestAttachmentKind');
  }
  return {
    ...metadata,
    messageCount: safeInteger(value, 'messageCount'),
    latestMessageContent: latestMessageContent as string | null,
    latestAttachmentKind: latestAttachmentKind as ChatAttachmentKind | null,
  };
}

function parseAttachment(value: unknown): ChatAttachmentMeta {
  if (!isRecord(value)) throw invalidResponse('Invalid attachment payload');
  const kind = requiredString(value, 'kind', 16);
  if (!ATTACHMENT_KINDS.has(kind as ChatAttachmentKind)) throw invalidResponse('Invalid attachment kind');
  const storageState = requiredString(value, 'storageState', 16);
  if (!ATTACHMENT_STATES.has(storageState as ChatAttachmentStorageState)) throw invalidResponse('Invalid attachment state');
  const durationMs = nullableSafeInteger(value, 'durationMs');
  return {
    id: validId(value, 'id'),
    kind: kind as ChatAttachmentKind,
    name: requiredString(value, 'name', 240),
    mimeType: requiredString(value, 'mimeType', 180),
    size: safeInteger(value, 'size'),
    createdAt: safeInteger(value, 'createdAt'),
    storageState: storageState as ChatAttachmentStorageState,
    ...(durationMs === null ? {} : { durationMs }),
  };
}

function parseMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) throw invalidResponse('Invalid message payload');
  const role = requiredString(value, 'role', 16);
  if (!MESSAGE_ROLES.has(role as ChatMessageRole)) throw invalidResponse('Invalid message role');
  const status = requiredString(value, 'status', 16);
  if (!MESSAGE_STATUSES.has(status as ChatMessageStatus)) throw invalidResponse('Invalid message status');
  const editedAt = nullableSafeInteger(value, 'editedAt');
  const attachmentsValue = value.attachments;
  if (!Array.isArray(attachmentsValue)) throw invalidResponse('Invalid message attachments');
  return {
    id: validId(value, 'id'),
    role: role as ChatMessageRole,
    status: status as ChatMessageStatus,
    content: typeof value.content === 'string' && value.content.length <= 12_000
      ? value.content
      : (() => { throw invalidResponse('Invalid message content'); })(),
    createdAt: safeInteger(value, 'createdAt'),
    ...(editedAt === null ? {} : { editedAt }),
    ...(attachmentsValue.length ? { attachments: attachmentsValue.map(parseAttachment) } : {}),
  };
}

function parseErrorCode(value: unknown): ServerChatRepositoryErrorCode {
  const known = new Set<ServerChatRepositoryErrorCode>([
    'authentication_required',
    'invalid_input',
    'not_found',
    'conversation_limit',
    'message_limit',
    'conflict',
    'attachments_not_ready',
    'service_unavailable',
  ]);
  return typeof value === 'string' && known.has(value as ServerChatRepositoryErrorCode)
    ? value as ServerChatRepositoryErrorCode
    : 'service_unavailable';
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw invalidResponse('Server returned invalid JSON');
  }
}

function ensureCursor(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value || value.length > 256) throw invalidResponse(`Invalid ${field}`);
  return value;
}

export class ServerConversationRepository implements ConversationRepository {
  constructor(private readonly basePath = '/api/chat') {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    if (init?.body !== undefined && init.body !== null) headers.set('Content-Type', 'application/json');
    if (method !== 'GET' && method !== 'HEAD') headers.set('X-ARVELIS-Request', '1');

    let response: Response;
    try {
      response = await fetch(`${this.basePath}${path}`, {
        ...init,
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new ServerChatRepositoryError('network_error', 'Не удалось связаться с сервером ARVELIS.');
    }

    if (response.status === 204) return null;
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
      const code = parseErrorCode(error?.code);
      const message = typeof error?.message === 'string' && error.message.length <= 500
        ? error.message
        : 'Chat request failed';
      throw new ServerChatRepositoryError(code, message, response.status);
    }
    return payload;
  }

  async listPage(options: ConversationListOptions = {}): Promise<ConversationListPage> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.cursor !== undefined) params.set('cursor', options.cursor);
    const query = params.size ? `?${params.toString()}` : '';
    const payload = await this.request(`/conversations${query}`);
    if (!isRecord(payload) || !Array.isArray(payload.items)) throw invalidResponse('Invalid conversation list');
    return {
      items: payload.items.map(parseConversationSummary),
      nextCursor: ensureCursor(payload.nextCursor, 'nextCursor'),
    };
  }

  async getPage(
    conversationId: string,
    options: ConversationMessagePageOptions = {},
  ): Promise<ConversationMessagePage | null> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('messageLimit', String(options.limit));
    if (options.cursor !== undefined) params.set('messageCursor', options.cursor);
    const query = params.size ? `?${params.toString()}` : '';
    try {
      const payload = await this.request(`/conversations/${encodeURIComponent(conversationId)}${query}`);
      if (!isRecord(payload) || !Array.isArray(payload.messages)) throw invalidResponse('Invalid conversation page');
      return {
        conversation: parseConversationMetadata(payload.conversation),
        messages: payload.messages.map(parseMessage),
        nextMessageCursor: ensureCursor(payload.nextMessageCursor, 'nextMessageCursor'),
      };
    } catch (error) {
      if (error instanceof ServerChatRepositoryError && error.code === 'not_found') return null;
      throw error;
    }
  }

  async create(input: CreateConversationInput): Promise<ChatMutationResult> {
    if (input.attachments.length) {
      throw new ServerChatRepositoryError('attachments_not_ready', 'Серверная загрузка вложений ещё не подключена.');
    }
    if (input.modelPreference) {
      throw new ServerChatRepositoryError('models_not_ready', 'Выбранная модель ещё не подключена к AI gateway.');
    }
    const payload = await this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify({ content: input.content }),
    });
    return this.parseMutation(payload);
  }

  async appendUserMessage(input: AppendMessageInput): Promise<ChatMutationResult> {
    if (input.attachments.length) {
      throw new ServerChatRepositoryError('attachments_not_ready', 'Серверная загрузка вложений ещё не подключена.');
    }
    const payload = await this.request(`/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: input.content }),
    });
    return this.parseMutation(payload);
  }

  async updateUserMessage(input: UpdateMessageInput): Promise<ChatMutationResult> {
    const payload = await this.request(
      `/conversations/${encodeURIComponent(input.conversationId)}/messages/${encodeURIComponent(input.messageId)}`,
      { method: 'PATCH', body: JSON.stringify({ content: input.content }) },
    );
    return this.parseMutation(payload);
  }

  async rename(conversationId: string, title: string): Promise<ConversationMetadata & { version: number }> {
    const payload = await this.request(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    if (!isRecord(payload)) throw invalidResponse('Invalid rename response');
    return parseConversationMetadata(payload.conversation);
  }

  async delete(conversationId: string): Promise<void> {
    await this.request(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
  }

  private parseMutation(payload: unknown): ChatMutationResult {
    if (!isRecord(payload)) throw invalidResponse('Invalid mutation response');
    return {
      conversation: parseConversationMetadata(payload.conversation),
      message: parseMessage(payload.message),
    };
  }
}
