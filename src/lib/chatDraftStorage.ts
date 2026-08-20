const DRAFT_STORAGE_KEY = 'arvelis.preview.chatDrafts.v1';
const MAX_DRAFTS = 64;
const MAX_DRAFT_LENGTH = 6000;

type DraftStore = Record<string, string>;

function readDraftStore(): DraftStore {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => (
        key.length <= 160 &&
        typeof value === 'string' &&
        value.length <= MAX_DRAFT_LENGTH
      ))
      .slice(0, MAX_DRAFTS);

    return Object.fromEntries(entries);
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
  const normalized = content.slice(0, MAX_DRAFT_LENGTH);
  const store = readDraftStore();

  if (!normalized) {
    if (!(key in store)) return true;
    delete store[key];
    return writeDraftStore(store);
  }

  store[key] = normalized;

  const keys = Object.keys(store);
  if (keys.length > MAX_DRAFTS) {
    for (const staleKey of keys.slice(0, keys.length - MAX_DRAFTS)) {
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
