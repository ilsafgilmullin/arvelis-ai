export type AppScreen = 'workspace' | 'chat' | 'history' | 'profile' | 'states';

export type EntryScreen = 'splash' | 'auth' | 'boot' | 'app';

export type DemoMessageRole = 'user' | 'assistant' | 'system';

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

export type DemoMessage = {
  id: string;
  role: DemoMessageRole;
  content: string;
  createdAt: number;
  editedAt?: number;
  attachments?: ChatAttachmentMeta[];
  /** Legacy preview compatibility only. New user-visible content must never set this. */
  mock?: boolean;
};

export type DemoThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: DemoMessage[];
};

export type DemoWorkspaceState = {
  threads: DemoThread[];
  activeThreadId: string | null;
  profileName: string;
};

export type SystemState = 'loading' | 'empty' | 'error' | 'offline' | 'limit';
