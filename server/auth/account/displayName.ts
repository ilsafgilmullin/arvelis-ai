const MAX_DISPLAY_NAME_LENGTH = 80;
const SYSTEM_RESERVED_NAME = 'Пользователь ARVELIS';
const UNSAFE_TEXT_PATTERN = /\p{C}/u;

export type DisplayNameValidationResult =
  | { ok: true; value: string }
  | { ok: false };

export function normalizeAccountDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateAccountDisplayName(value: unknown): DisplayNameValidationResult {
  if (typeof value !== 'string' || UNSAFE_TEXT_PATTERN.test(value)) return { ok: false };

  const normalized = normalizeAccountDisplayName(value);
  if (!normalized || normalized.length > MAX_DISPLAY_NAME_LENGTH || normalized === SYSTEM_RESERVED_NAME) {
    return { ok: false };
  }

  return { ok: true, value: normalized };
}

export const ACCOUNT_DISPLAY_NAME_MAX_LENGTH = MAX_DISPLAY_NAME_LENGTH;
