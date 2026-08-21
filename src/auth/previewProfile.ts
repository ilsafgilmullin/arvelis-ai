export const PREVIEW_PROFILE_NAME_MAX_LENGTH = 80;
export const DEFAULT_PREVIEW_PROFILE_NAME = 'Пользователь ARVELIS';

const PREVIEW_PROFILE_CONTROL_CHARACTER_PATTERN = /\p{C}/u;

export function normalizePreviewProfileName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validatePreviewProfileName(value: string): string | null {
  if (PREVIEW_PROFILE_CONTROL_CHARACTER_PATTERN.test(value)) {
    return 'Имя содержит недопустимые служебные символы.';
  }

  const normalized = normalizePreviewProfileName(value);

  if (!normalized) return 'Введите имя, которое будет использоваться в интерфейсе.';
  if (normalized.length > PREVIEW_PROFILE_NAME_MAX_LENGTH) {
    return `Имя должно быть короче ${PREVIEW_PROFILE_NAME_MAX_LENGTH + 1} символов.`;
  }
  if (normalized === DEFAULT_PREVIEW_PROFILE_NAME) {
    return 'Это имя зарезервировано интерфейсом ARVELIS AI. Выберите другое.';
  }

  return null;
}

export function isDefaultPreviewProfileName(value: string): boolean {
  return normalizePreviewProfileName(value) === DEFAULT_PREVIEW_PROFILE_NAME;
}

/**
 * Resolves untrusted/legacy browser-storage data into the only profile-name
 * states that the preview UI is allowed to consume.
 *
 * Invalid user names do not invalidate otherwise healthy local workspace data;
 * only the profile name falls back to the system default.
 */
export function resolveStoredPreviewProfileName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PREVIEW_PROFILE_NAME;

  const normalized = normalizePreviewProfileName(value);
  if (normalized === DEFAULT_PREVIEW_PROFILE_NAME) return DEFAULT_PREVIEW_PROFILE_NAME;
  return validatePreviewProfileName(value) === null
    ? normalized
    : DEFAULT_PREVIEW_PROFILE_NAME;
}

/**
 * Browser persistence accepts only canonical user names or the internal
 * default placeholder. Non-canonical whitespace is normalized before it ever
 * reaches workspace state instead of being written back verbatim.
 */
export function isPersistablePreviewProfileName(value: string): boolean {
  return resolveStoredPreviewProfileName(value) === value;
}
