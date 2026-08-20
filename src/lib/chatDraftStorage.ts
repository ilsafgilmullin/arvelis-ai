import { CHAT_DRAFT_MAX_ENTRIES, CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';

const DRAFT_STORAGE_KEY = 'arvelis.preview.chatDrafts.v1';
const MAX_DRAFT_KEY_LENGTH = 160;

type DraftStore = Record<string, string>;

function readDraftStore(): DraftStore {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const store: DraftStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        key.length <= MAX_DRAFT_KEY_LENGTH &&
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
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function chatDraftKey(threadId: string | null): string {
  return threadId ? `thread:${threadId}` : 'thread:new';
}

export function loadChatDraft(key: string): string {
  return readDraftStore()[key] ?? '';
}

export function saveChatDraft(key: string, content: string): boolean {
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
