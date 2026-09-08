export type AppScreen = 'workspace' | 'chat' | 'history' | 'profile' | 'states';

export type EntryScreen = 'resolving' | 'auth' | 'app';

export type DemoMessageRole = 'user' | 'assistant' | 'system';

export type DemoMessage = {
  id: string;
  role: DemoMessageRole;
  content: string;
  createdAt: number;
  editedAt?: number;
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
