import { CHAT_ATTACHMENT_MAX_COUNT, isValidStoredAttachmentMeta } from '../chat/attachmentPolicy';
import type { ChatAttachmentMeta } from '../types';

const STORAGE_KEY = 'arvelis.chat.pending-attachments.v1';
const MAX_STORE_CHARS = 200_000;

type PendingStore = Record<string, ChatAttachmentMeta[]>;

function isDraftKey(value: string): boolean {
  return value.startsWith('thread:') || value.startsWith('account:');
}

function readStore(): PendingStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORE_CHARS) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const next: PendingStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isDraftKey(key) || !Array.isArray(value)) continue;
      const items = value.filter(isValidStoredAttachmentMeta).slice(0, CHAT_ATTACHMENT_MAX_COUNT);
      if (items.length) next[key] = items;
    }
    return next;
  } catch {
    return {};
  }
}

function writeStore(store: PendingStore): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(store);
    if (serialized.length > MAX_STORE_CHARS) return false;
    window.localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function loadPendingChatAttachments(draftKey: string): ChatAttachmentMeta[] {
  if (!isDraftKey(draftKey)) return [];
  return readStore()[draftKey] ?? [];
}

export function savePendingChatAttachments(draftKey: string, attachments: ChatAttachmentMeta[]): boolean {
  if (!isDraftKey(draftKey)) return false;
  if (attachments.length > CHAT_ATTACHMENT_MAX_COUNT || !attachments.every(isValidStoredAttachmentMeta)) return false;
  const store = readStore();
  if (!attachments.length) delete store[draftKey];
  else store[draftKey] = attachments;
  return writeStore(store);
}

export function clearPendingChatAttachments(draftKey: string): boolean {
  if (!isDraftKey(draftKey)) return false;
  const store = readStore();
  if (!(draftKey in store)) return true;
  delete store[draftKey];
  return writeStore(store);
}
