export type AppScreen = 'workspace' | 'chat' | 'history' | 'profile' | 'states';

export type EntryScreen = 'splash' | 'auth' | 'boot' | 'app';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

export type ChatMessageStatus =
  | 'local'
  | 'pending'
  | 'sending'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ChatAttachmentKind = 'image' | 'video' | 'audio' | 'file';

export type ChatAttachmentMeta = {
  id: string;
  kind: ChatAttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  durationMs?: number;
};

export type ChatTextPart = {
  type: 'text';
  text: string;
};

export type ChatAttachmentPart = {
  type: 'attachment';
  attachment: ChatAttachmentMeta;
};

/**
 * Forward-compatible message content contract for the future server Chat API.
 * The current closed-test browser persistence still stores `content` and
 * `attachments` separately and is migrated through the legacy storage adapter.
 */
export type ChatMessagePart = ChatTextPart | ChatAttachmentPart;

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: number;
  editedAt?: number;
  attachments?: ChatAttachmentMeta[];
  status?: ChatMessageStatus;
  /** Legacy preview compatibility only. New user-visible content must never set this. */
  mock?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  modelPreference?: string | null;
};

export type ChatWorkspaceState = {
  threads: Conversation[];
  activeThreadId: string | null;
  profileName: string;
};

/** Legacy aliases retained only while old browser data and tests are migrated. */
export type DemoMessageRole = ChatMessageRole;
export type DemoMessage = ChatMessage;
export type DemoThread = Conversation;
export type DemoWorkspaceState = ChatWorkspaceState;

export type SystemState = 'loading' | 'empty' | 'error' | 'offline' | 'limit';
