import type {
  ChatAttachmentMeta,
  ChatMessage,
  ConversationMetadata,
  ConversationSummary,
} from '../types';

export type ConversationListOptions = {
  limit?: number;
  cursor?: string;
};

export type ConversationMessagePageOptions = {
  limit?: number;
  cursor?: string;
};

export type ConversationListPage = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export type ConversationMessagePage = {
  conversation: ConversationMetadata & { version: number };
  messages: ChatMessage[];
  nextMessageCursor: string | null;
};

export type CreateConversationInput = {
  content: string;
  attachments: ChatAttachmentMeta[];
  modelPreference?: string | null;
};

export type AppendMessageInput = {
  conversationId: string;
  content: string;
  attachments: ChatAttachmentMeta[];
};

export type UpdateMessageInput = {
  conversationId: string;
  messageId: string;
  content: string;
};

export type ChatMutationResult = {
  conversation: ConversationMetadata & { version: number };
  message: ChatMessage;
};

/**
 * UI-facing Chat persistence boundary. List and detail reads are cursor-based
 * so Home/History never require loading every message in every conversation.
 * Browser-local compatibility is handled by a separate adapter; server data
 * must satisfy this contract without exposing persistence internals.
 */
export interface ConversationRepository {
  listPage(options?: ConversationListOptions): Promise<ConversationListPage>;
  getPage(conversationId: string, options?: ConversationMessagePageOptions): Promise<ConversationMessagePage | null>;
  create(input: CreateConversationInput): Promise<ChatMutationResult>;
  appendUserMessage(input: AppendMessageInput): Promise<ChatMutationResult>;
  updateUserMessage(input: UpdateMessageInput): Promise<ChatMutationResult>;
  rename(conversationId: string, title: string): Promise<ConversationMetadata & { version: number }>;
  delete(conversationId: string): Promise<void>;
}

export interface AttachmentRepository {
  save(attachment: ChatAttachmentMeta, blob: Blob): Promise<boolean>;
  load(attachmentId: string): Promise<Blob | null>;
  delete(attachmentId: string): Promise<void>;
  deleteMany(attachmentIds: readonly string[]): Promise<void>;
}
