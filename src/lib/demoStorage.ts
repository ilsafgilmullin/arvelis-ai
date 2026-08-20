import { initialDemoThreads } from '../data/demo';
import type { DemoMessage, DemoThread, DemoWorkspaceState } from '../types';

const STORAGE_KEY = 'arvelis.demo.workspace.v1';
const STORAGE_PROBE_KEY = 'arvelis.demo.storage.probe';
const VALID_ROLES = new Set<DemoMessage['role']>(['user', 'assistant', 'system']);
const COMPACT_PREVIEW_STATUS = 'Сохранено в локальном preview. AI пока не подключён.';

const LEGACY_PREVIEW_COPY = new Map<string, string>([
  [
    'Запрос сохранён локально для тестирования интерфейса. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
    COMPACT_PREVIEW_STATUS,
  ],
  [
    'Запрос добавлен в локальный demo-сеанс. При доступном localStorage состояние сохраняется в этом браузере. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
    COMPACT_PREVIEW_STATUS,
  ],
  [
    'Запрос добавлен в локальный preview-сеанс. При доступном localStorage состояние сохраняется в этом браузере. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
    COMPACT_PREVIEW_STATUS,
  ],
  [
    'Это демонстрационный пример структуры ответа. Реальный AI не подключён. В production здесь появится проверяемый разбор цели, ограничений, рисков и последовательности действий.',
    'Это предзаписанный пример структуры ответа. Реальный AI не подключён. В рабочей версии здесь должен появиться проверяемый разбор цели, ограничений, рисков и последовательности действий.',
  ],
]);

export const DEMO_MAX_THREADS = 40;
export const DEMO_MAX_MESSAGES_PER_THREAD = 80;
const DEMO_MAX_TOTAL_CONTENT_CHARS = 1_000_000;

const defaultState = (): DemoWorkspaceState => ({
  threads: initialDemoThreads.map((thread) => ({
    ...thread,
    messages: thread.messages.map((message) => ({ ...message })),
  })),
  activeThreadId: initialDemoThreads[0]?.id ?? null,
  profileName: 'Пользователь ARVELIS',
});

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

function isMessage(value: unknown): value is DemoMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<DemoMessage>;
  return (
    typeof message.id === 'string' &&
    message.id.length <= 128 &&
    typeof message.role === 'string' &&
    VALID_ROLES.has(message.role as DemoMessage['role']) &&
    typeof message.content === 'string' &&
    message.content.length <= 12_000 &&
    isValidTimestamp(message.createdAt) &&
    (message.mock === undefined || typeof message.mock === 'boolean')
  );
}

function isThread(value: unknown): value is DemoThread {
  if (!value || typeof value !== 'object') return false;
  const thread = value as Partial<DemoThread>;
  return (
    typeof thread.id === 'string' &&
    thread.id.length <= 128 &&
    typeof thread.title === 'string' &&
    thread.title.length <= 160 &&
    isValidTimestamp(thread.createdAt) &&
    isValidTimestamp(thread.updatedAt) &&
    Array.isArray(thread.messages) &&
    thread.messages.length <= DEMO_MAX_MESSAGES_PER_THREAD &&
    thread.messages.every(isMessage)
  );
}

function normalizeKnownLegacyCopy(thread: DemoThread): DemoThread {
  let changed = false;
  let previewStatusSeen = false;
  const messages: DemoMessage[] = [];

  for (const message of thread.messages) {
    const normalizedContent = LEGACY_PREVIEW_COPY.get(message.content) ?? message.content;
    const normalizedMessage = normalizedContent === message.content
      ? message
      : { ...message, content: normalizedContent };

    if (normalizedContent !== message.content) changed = true;

    if (normalizedMessage.role === 'system' && normalizedContent === COMPACT_PREVIEW_STATUS) {
      if (previewStatusSeen) {
        changed = true;
        continue;
      }
      previewStatusSeen = true;
    }

    messages.push(normalizedMessage);
  }

  return changed ? { ...thread, messages } : thread;
}

function isWithinContentBudget(threads: DemoThread[]): boolean {
  let total = 0;
  for (const thread of threads) {
    total += thread.title.length;
    for (const message of thread.messages) {
      total += message.content.length;
      if (total > DEMO_MAX_TOTAL_CONTENT_CHARS) return false;
    }
  }
  return true;
}

function isWorkspacePersistable(state: DemoWorkspaceState): boolean {
  return (
    state.threads.length <= DEMO_MAX_THREADS &&
    state.threads.every(isThread) &&
    isWithinContentBudget(state.threads) &&
    state.profileName.length <= 80
  );
}

export function canUseDemoStorage(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(STORAGE_PROBE_KEY, '1');
    window.localStorage.removeItem(STORAGE_PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadDemoWorkspace(): DemoWorkspaceState {
  if (typeof window === 'undefined') return defaultState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw) as Partial<DemoWorkspaceState>;
    if (
      !Array.isArray(parsed.threads) ||
      parsed.threads.length > DEMO_MAX_THREADS ||
      !parsed.threads.every(isThread) ||
      !isWithinContentBudget(parsed.threads)
    ) {
      return defaultState();
    }

    const threads = parsed.threads.map(normalizeKnownLegacyCopy);
    const activeThreadId = typeof parsed.activeThreadId === 'string' && threads.some((thread) => thread.id === parsed.activeThreadId)
      ? parsed.activeThreadId
      : threads[0]?.id ?? null;

    return {
      threads,
      activeThreadId,
      profileName: typeof parsed.profileName === 'string' && parsed.profileName.trim() && parsed.profileName.length <= 80 ? parsed.profileName : 'Пользователь ARVELIS',
    };
  } catch {
    return defaultState();
  }
}

export function saveDemoWorkspace(state: DemoWorkspaceState): boolean {
  if (typeof window === 'undefined' || !isWorkspacePersistable(state)) return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetDemoWorkspace(): DemoWorkspaceState {
  const state = defaultState();
  saveDemoWorkspace(state);
  return state;
}
