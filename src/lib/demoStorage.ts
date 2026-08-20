import { DEMO_MOCK_RESPONSE, initialDemoThreads } from '../data/demo';
import type { DemoMessage, DemoThread, DemoWorkspaceState } from '../types';

const STORAGE_KEY = 'arvelis.demo.workspace.v1';
const STORAGE_PROBE_KEY = 'arvelis.demo.storage.probe';
const VALID_ROLES = new Set<DemoMessage['role']>(['user', 'assistant', 'system']);
export const DEMO_PREVIEW_NOTICE = 'Сообщение сохранено на этом устройстве. AI-ответы в этой версии пока недоступны.';

const LEGACY_SYSTEM_PREVIEW_COPY = new Set<string>([
  'Запрос сохранён локально для тестирования интерфейса. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
  'Запрос добавлен в локальный demo-сеанс. При доступном localStorage состояние сохраняется в этом браузере. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
  'Запрос добавлен в локальный preview-сеанс. При доступном localStorage состояние сохраняется в этом браузере. Реальный AI пока не подключён, поэтому ответ модели не генерируется.',
  'Сохранено в локальном preview. AI пока не подключён.',
]);

const LEGACY_ASSISTANT_MOCK_COPY = new Set<string>([
  DEMO_MOCK_RESPONSE,
  'Это демонстрационный пример структуры ответа. Реальный AI не подключён. В production здесь появится проверяемый разбор цели, ограничений, рисков и последовательности действий.',
  'Это предзаписанный пример структуры ответа. Реальный AI не подключён. В рабочей версии здесь должен появиться проверяемый разбор цели, ограничений, рисков и последовательности действий.',
]);

export const DEMO_MAX_THREADS = 40;
export const DEMO_MAX_MESSAGES_PER_THREAD = 80;
const DEMO_MAX_TOTAL_CONTENT_CHARS = 1_000_000;
const DEMO_MAX_SERIALIZED_CHARS = 2_500_000;
const DEMO_MAX_ID_LENGTH = 128;
const DEMO_MAX_TITLE_LENGTH = 160;
const DEMO_MAX_STORED_MESSAGE_CHARS = 12_000;
const DEMO_MAX_PROFILE_NAME_CHARS = 80;

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

function isValidIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= DEMO_MAX_ID_LENGTH && value.trim() === value;
}

function isMessage(value: unknown): value is DemoMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<DemoMessage>;
  return (
    isValidIdentifier(message.id) &&
    typeof message.role === 'string' &&
    VALID_ROLES.has(message.role as DemoMessage['role']) &&
    typeof message.content === 'string' &&
    message.content.length > 0 &&
    message.content.length <= DEMO_MAX_STORED_MESSAGE_CHARS &&
    isValidTimestamp(message.createdAt) &&
    (message.editedAt === undefined || isValidTimestamp(message.editedAt)) &&
    (message.mock === undefined || typeof message.mock === 'boolean')
  );
}

function isThread(value: unknown): value is DemoThread {
  if (!value || typeof value !== 'object') return false;
  const thread = value as Partial<DemoThread>;
  return (
    isValidIdentifier(thread.id) &&
    typeof thread.title === 'string' &&
    thread.title.trim().length > 0 &&
    thread.title.length <= DEMO_MAX_TITLE_LENGTH &&
    isValidTimestamp(thread.createdAt) &&
    isValidTimestamp(thread.updatedAt) &&
    Array.isArray(thread.messages) &&
    thread.messages.length <= DEMO_MAX_MESSAGES_PER_THREAD &&
    thread.messages.every(isMessage)
  );
}

function hasUniqueWorkspaceIds(threads: DemoThread[]): boolean {
  const threadIds = new Set<string>();

  for (const thread of threads) {
    if (threadIds.has(thread.id)) return false;
    threadIds.add(thread.id);

    const messageIds = new Set<string>();
    for (const message of thread.messages) {
      if (messageIds.has(message.id)) return false;
      messageIds.add(message.id);
    }
  }

  return true;
}

function normalizeKnownLegacyCopy(thread: DemoThread): DemoThread {
  let changed = false;
  let previewStatusSeen = false;
  const messages: DemoMessage[] = [];

  for (const message of thread.messages) {
    let normalizedMessage = message;

    if (message.role === 'system' && LEGACY_SYSTEM_PREVIEW_COPY.has(message.content)) {
      normalizedMessage = message.content === DEMO_PREVIEW_NOTICE
        ? message
        : { ...message, content: DEMO_PREVIEW_NOTICE };
    } else if (message.role === 'assistant' && LEGACY_ASSISTANT_MOCK_COPY.has(message.content)) {
      normalizedMessage = message.content === DEMO_MOCK_RESPONSE && message.mock === true
        ? message
        : { ...message, content: DEMO_MOCK_RESPONSE, mock: true };
    }

    if (normalizedMessage !== message) changed = true;

    if (normalizedMessage.role === 'system' && normalizedMessage.content === DEMO_PREVIEW_NOTICE) {
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
    hasUniqueWorkspaceIds(state.threads) &&
    isWithinContentBudget(state.threads) &&
    state.profileName.trim().length > 0 &&
    state.profileName.length <= DEMO_MAX_PROFILE_NAME_CHARS &&
    (state.activeThreadId === null || state.threads.some((thread) => thread.id === state.activeThreadId))
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
    if (!raw || raw.length > DEMO_MAX_SERIALIZED_CHARS) return defaultState();

    const parsed = JSON.parse(raw) as Partial<DemoWorkspaceState>;
    if (
      !Array.isArray(parsed.threads) ||
      parsed.threads.length > DEMO_MAX_THREADS ||
      !parsed.threads.every(isThread) ||
      !hasUniqueWorkspaceIds(parsed.threads) ||
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
      profileName: typeof parsed.profileName === 'string' && parsed.profileName.trim() && parsed.profileName.length <= DEMO_MAX_PROFILE_NAME_CHARS
        ? parsed.profileName
        : 'Пользователь ARVELIS',
    };
  } catch {
    return defaultState();
  }
}

export function saveDemoWorkspace(state: DemoWorkspaceState): boolean {
  if (typeof window === 'undefined' || !isWorkspacePersistable(state)) return false;

  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > DEMO_MAX_SERIALIZED_CHARS) return false;
    window.localStorage.setItem(STORAGE_KEY, serialized);
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
