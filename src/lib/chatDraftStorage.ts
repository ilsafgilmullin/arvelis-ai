import { CHAT_DRAFT_MAX_ENTRIES, CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';

const DRAFT_STORAGE_KEY = 'arvelis.preview.chatDrafts.v1';
const MAX_THREAD_ID_LENGTH = 128;
const MAX_DRAFT_KEY_LENGTH = 'thread:'.length + MAX_THREAD_ID_LENGTH;
const MAX_DRAFT_STORE_CHARS = 1_000_000;

type DraftStore = Record<string, string>;

function isValidDraftKey(key: string): boolean {
  if (key === 'thread:new') return true;
  if (!key.startsWith('thread:') || key.length > MAX_DRAFT_KEY_LENGTH) return false;
  const threadId = key.slice('thread:'.length);
  return threadId.length > 0 && threadId.length <= MAX_THREAD_ID_LENGTH && threadId.trim() === threadId;
}

function readDraftStore(): DraftStore {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw || raw.length > MAX_DRAFT_STORE_CHARS) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const store: DraftStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        isValidDraftKey(key) &&
        typeof value === 'string' &&
        value.length <= CHAT_MESSAGE_MAX_CHARS
      ) {
        store[key] = value;
      }
    }

    const keys = Object.keys(store);
    if (keys.length > CHAT_DRAFT_MAX_ENTRIES) {
      for (const staleKey of keys.slice(0, keys.length - CHAT_DRAFT_MAX_ENTRIES)) {
        delete store[staleKey];
      }
    }

    return store;
  } catch {
    return {};
  }
}

function writeDraftStore(store: DraftStore): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const serialized = JSON.stringify(store);
    if (serialized.length > MAX_DRAFT_STORE_CHARS) return false;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function chatDraftKey(threadId: string | null): string {
  return threadId ? `thread:${threadId}` : 'thread:new';
}

export function loadChatDraft(key: string): string {
  if (!isValidDraftKey(key)) return '';
  return readDraftStore()[key] ?? '';
}

export function saveChatDraft(key: string, content: string): boolean {
  if (!isValidDraftKey(key)) return false;
  const normalized = content.slice(0, CHAT_MESSAGE_MAX_CHARS);
  const store = readDraftStore();

  if (!normalized) {
    if (!(key in store)) return true;
    delete store[key];
    return writeDraftStore(store);
  }

  delete store[key];
  store[key] = normalized;

  const keys = Object.keys(store);
  if (keys.length > CHAT_DRAFT_MAX_ENTRIES) {
    for (const staleKey of keys.slice(0, keys.length - CHAT_DRAFT_MAX_ENTRIES)) {
      delete store[staleKey];
    }
  }

  return writeDraftStore(store);
}

export function removeChatDraft(key: string): boolean {
  if (!isValidDraftKey(key)) return false;
  const store = readDraftStore();
  if (!(key in store)) return true;
  delete store[key];
  return writeDraftStore(store);
}

export function clearChatDrafts(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
