import { initialDemoThreads } from '../data/demo';
import type { DemoMessage, DemoThread, DemoWorkspaceState } from '../types';

const STORAGE_KEY = 'arvelis.demo.workspace.v1';
const VALID_ROLES = new Set<DemoMessage['role']>(['user', 'assistant', 'system']);

const defaultState = (): DemoWorkspaceState => ({
  threads: initialDemoThreads,
  activeThreadId: initialDemoThreads[0]?.id ?? null,
  profileName: 'Пользователь ARVELIS',
});

function isMessage(value: unknown): value is DemoMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<DemoMessage>;
  return (
    typeof message.id === 'string' &&
    typeof message.role === 'string' &&
    VALID_ROLES.has(message.role as DemoMessage['role']) &&
    typeof message.content === 'string' &&
    message.content.length <= 12_000 &&
    typeof message.createdAt === 'number' &&
    Number.isFinite(message.createdAt) &&
    (message.mock === undefined || typeof message.mock === 'boolean')
  );
}

function isThread(value: unknown): value is DemoThread {
  if (!value || typeof value !== 'object') return false;
  const thread = value as Partial<DemoThread>;
  return (
    typeof thread.id === 'string' &&
    typeof thread.title === 'string' &&
    thread.title.length <= 160 &&
    typeof thread.createdAt === 'number' &&
    Number.isFinite(thread.createdAt) &&
    typeof thread.updatedAt === 'number' &&
    Number.isFinite(thread.updatedAt) &&
    Array.isArray(thread.messages) &&
    thread.messages.length <= 500 &&
    thread.messages.every(isMessage)
  );
}

export function loadDemoWorkspace(): DemoWorkspaceState {
  if (typeof window === 'undefined') return defaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw) as Partial<DemoWorkspaceState>;
    if (!Array.isArray(parsed.threads) || parsed.threads.length > 200 || !parsed.threads.every(isThread)) return defaultState();

    const activeThreadId = typeof parsed.activeThreadId === 'string' && parsed.threads.some((thread) => thread.id === parsed.activeThreadId)
      ? parsed.activeThreadId
      : parsed.threads[0]?.id ?? null;

    return {
      threads: parsed.threads,
      activeThreadId,
      profileName: typeof parsed.profileName === 'string' && parsed.profileName.trim() && parsed.profileName.length <= 80 ? parsed.profileName : 'Пользователь ARVELIS',
    };
  } catch {
    return defaultState();
  }
}

export function saveDemoWorkspace(state: DemoWorkspaceState): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local persistence is optional in the prototype. UI remains usable if storage is unavailable.
  }
}

export function resetDemoWorkspace(): DemoWorkspaceState {
  const state = defaultState();
  saveDemoWorkspace(state);
  return state;
}
