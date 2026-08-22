import type { ChatAttachmentMeta, ChatMessage, Conversation } from '../types';

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

/**
 * UI-facing persistence boundary. The current closed-test implementation is
 * browser-local; a future server implementation must satisfy the same contract.
 */
export interface ConversationRepository {
  list(): Promise<Conversation[]>;
  get(conversationId: string): Promise<Conversation | null>;
  create(input: CreateConversationInput): Promise<Conversation>;
  appendUserMessage(input: AppendMessageInput): Promise<ChatMessage>;
  updateUserMessage(input: UpdateMessageInput): Promise<ChatMessage>;
  rename(conversationId: string, title: string): Promise<void>;
  delete(conversationId: string): Promise<void>;
}

export interface AttachmentRepository {
  save(attachment: ChatAttachmentMeta, blob: Blob): Promise<boolean>;
  load(attachmentId: string): Promise<Blob | null>;
  delete(attachmentId: string): Promise<void>;
  deleteMany(attachmentIds: readonly string[]): Promise<void>;
}
