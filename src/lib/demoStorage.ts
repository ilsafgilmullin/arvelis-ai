import { initialDemoThreads } from '../data/demo';
import type { DemoThread, DemoWorkspaceState } from '../types';

const STORAGE_KEY = 'arvelis.demo.workspace.v1';

const defaultState = (): DemoWorkspaceState => ({
  threads: initialDemoThreads,
  activeThreadId: initialDemoThreads[0]?.id ?? null,
  profileName: 'Пользователь ARVELIS',
});

function isThread(value: unknown): value is DemoThread {
  if (!value || typeof value !== 'object') return false;
  const thread = value as Partial<DemoThread>;
  return (
    typeof thread.id === 'string' &&
    typeof thread.title === 'string' &&
    typeof thread.createdAt === 'number' &&
    typeof thread.updatedAt === 'number' &&
    Array.isArray(thread.messages)
  );
}

export function loadDemoWorkspace(): DemoWorkspaceState {
  if (typeof window === 'undefined') return defaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw) as Partial<DemoWorkspaceState>;
    if (!Array.isArray(parsed.threads) || !parsed.threads.every(isThread)) return defaultState();

    return {
      threads: parsed.threads,
      activeThreadId: typeof parsed.activeThreadId === 'string' ? parsed.activeThreadId : parsed.threads[0]?.id ?? null,
      profileName: typeof parsed.profileName === 'string' && parsed.profileName.trim() ? parsed.profileName : 'Пользователь ARVELIS',
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
