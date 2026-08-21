import { CHAT_DRAFT_MAX_ENTRIES, CHAT_MESSAGE_MAX_CHARS } from '../domain/chatPolicy';

const DRAFT_STORAGE_KEY = 'arvelis.preview.chatDrafts.v1';
const MAX_THREAD_ID_LENGTH = 128;
const ACCOUNT_SCOPE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const PREVIEW_DRAFT_PREFIX = 'thread:';
const ACCOUNT_DRAFT_PREFIX = 'account:';
const MAX_DRAFT_STORE_CHARS = 1_000_000;

type DraftStore = Record<string, string>;

let activeAccountScopeId: string | undefined;

function isValidThreadPart(value: string): boolean {
  if (value === 'new') return true;
  return value.length > 0 && value.length <= MAX_THREAD_ID_LENGTH && value.trim() === value;
}

function accountDraftPrefix(accountScopeId: string): string | null {
  return ACCOUNT_SCOPE_PATTERN.test(accountScopeId) ? `${ACCOUNT_DRAFT_PREFIX}${accountScopeId}:thread:` : null;
}

function isValidDraftKey(key: string): boolean {
  if (key.startsWith(PREVIEW_DRAFT_PREFIX)) {
    return isValidThreadPart(key.slice(PREVIEW_DRAFT_PREFIX.length));
  }

  if (!key.startsWith(ACCOUNT_DRAFT_PREFIX)) return false;
  const threadMarker = key.indexOf(':thread:', ACCOUNT_DRAFT_PREFIX.length);
  if (threadMarker < 0) return false;
  const accountScopeId = key.slice(ACCOUNT_DRAFT_PREFIX.length, threadMarker);
  const threadPart = key.slice(threadMarker + ':thread:'.length);
  return ACCOUNT_SCOPE_PATTERN.test(accountScopeId) && isValidThreadPart(threadPart);
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

export function setChatDraftAccountScope(accountScopeId?: string): boolean {
  if (accountScopeId !== undefined && !ACCOUNT_SCOPE_PATTERN.test(accountScopeId)) return false;
  activeAccountScopeId = accountScopeId;
  return true;
}

export function chatDraftKey(threadId: string | null, accountScopeId = activeAccountScopeId): string {
  const threadPart = threadId ?? 'new';
  if (!isValidThreadPart(threadPart)) return '';
  if (accountScopeId === undefined) return `${PREVIEW_DRAFT_PREFIX}${threadPart}`;
  const prefix = accountDraftPrefix(accountScopeId);
  return prefix ? `${prefix}${threadPart}` : '';
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

export function clearChatDrafts(accountScopeId = activeAccountScopeId): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const store = readDraftStore();
    const prefix = accountScopeId === undefined ? PREVIEW_DRAFT_PREFIX : accountDraftPrefix(accountScopeId);
    if (prefix === null) return false;

    let changed = false;
    for (const key of Object.keys(store)) {
      if (key.startsWith(prefix)) {
        delete store[key];
        changed = true;
      }
    }
    return changed ? writeDraftStore(store) : true;
  } catch {
    return false;
  }
}
