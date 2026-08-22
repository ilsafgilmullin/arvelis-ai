export const CHAT_MESSAGE_MAX_CHARS = 6000;
export const CHAT_THREAD_TITLE_MAX_CHARS = 80;
export const CHAT_SEARCH_MAX_CHARS = 160;
export const CHAT_COMPOSER_COUNTER_THRESHOLD = 4800;
export const CHAT_DRAFT_MAX_ENTRIES = 64;

/** Closed-test browser limits. Server quotas will be a separate policy later. */
export const CHAT_LOCAL_MAX_CONVERSATIONS = 40;
export const CHAT_LOCAL_MAX_MESSAGES_PER_CONVERSATION = 80;

export function normalizeChatMessage(content: string): string {
  return content.trim().slice(0, CHAT_MESSAGE_MAX_CHARS);
}

export function normalizeThreadTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, CHAT_THREAD_TITLE_MAX_CHARS);
}
