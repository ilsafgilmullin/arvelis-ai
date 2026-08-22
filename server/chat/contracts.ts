export type ServerChatMessageRole = 'user' | 'assistant' | 'system';
export type ServerChatMessageStatus = 'pending' | 'sending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
export type ServerChatAttachmentKind = 'image' | 'video' | 'audio' | 'file';
export type ServerChatAttachmentStorageState = 'pending' | 'ready' | 'failed';

export type ChatConversationRecord = {
  id: string;
  accountId: string;
  title: string;
  modelPreference: string | null;
  createdAt: number;
  updatedAt: number;
  version: number;
};

export type ChatAttachmentRecord = {
  id: string;
  messageId: string;
  kind: ServerChatAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  storageState: ServerChatAttachmentStorageState;
  storageKey: string | null;
  createdAt: number;
};

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  role: ServerChatMessageRole;
  status: ServerChatMessageStatus;
  content: string;
  position: number;
  createdAt: number;
  editedAt: number | null;
  attachments: ChatAttachmentRecord[];
};

export type ChatConversationSummaryRecord = ChatConversationRecord & {
  messageCount: number;
  latestMessageContent: string | null;
  latestAttachmentKind: ServerChatAttachmentKind | null;
};

export type ConversationListCursor = {
  updatedAt: number;
  id: string;
};

export type ListConversationsInput = {
  accountId: string;
  limit: number;
  before?: ConversationListCursor;
};

export type ListMessagesInput = {
  accountId: string;
  conversationId: string;
  limit: number;
  beforePosition?: number;
};

export type CreateConversationWithMessageInput = {
  conversation: ChatConversationRecord;
  message: ChatMessageRecord;
  maxConversations: number;
};

export type AppendUserMessageInput = {
  accountId: string;
  conversationId: string;
  message: Omit<ChatMessageRecord, 'position'>;
  maxMessages: number;
};

export type UpdateUserMessageInput = {
  accountId: string;
  conversationId: string;
  messageId: string;
  content: string;
  editedAt: number;
};

export type RenameConversationInput = {
  accountId: string;
  conversationId: string;
  title: string;
  updatedAt: number;
};

export type ChatCreateResult =
  | { ok: true; conversation: ChatConversationRecord; message: ChatMessageRecord }
  | { ok: false; reason: 'conversation_limit' | 'conflict' | 'unavailable' };

export type ChatMessageMutationResult =
  | { ok: true; conversation: ChatConversationRecord; message: ChatMessageRecord }
  | { ok: false; reason: 'not_found' | 'message_limit' | 'conflict' | 'unavailable' };

export type ChatConversationMutationResult =
  | { ok: true; conversation: ChatConversationRecord }
  | { ok: false; reason: 'not_found' | 'conflict' | 'unavailable' };

export type ChatDeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; reason: 'unavailable' };

/**
 * Account-scoped persistence boundary for Chat data. Every method that reads or
 * mutates existing data receives accountId so ownership is enforced inside the
 * datastore query, not only in HTTP routing.
 */
export interface ServerConversationStore {
  listConversations(input: ListConversationsInput): Promise<ChatConversationSummaryRecord[]>;
  getConversation(accountId: string, conversationId: string): Promise<ChatConversationRecord | null>;
  listMessages(input: ListMessagesInput): Promise<ChatMessageRecord[]>;
  createConversationWithUserMessage(input: CreateConversationWithMessageInput): Promise<ChatCreateResult>;
  appendUserMessage(input: AppendUserMessageInput): Promise<ChatMessageMutationResult>;
  updateUserMessage(input: UpdateUserMessageInput): Promise<ChatMessageMutationResult>;
  renameConversation(input: RenameConversationInput): Promise<ChatConversationMutationResult>;
  deleteConversation(accountId: string, conversationId: string): Promise<ChatDeleteResult>;
}
