export const PREVIEW_PROFILE_NAME_MAX_LENGTH = 80;

export function normalizePreviewProfileName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validatePreviewProfileName(value: string): string | null {
  const normalized = normalizePreviewProfileName(value);

  if (!normalized) return 'Введите имя, которое будет использоваться в интерфейсе.';
  if (normalized.length > PREVIEW_PROFILE_NAME_MAX_LENGTH) {
    return `Имя должно быть короче ${PREVIEW_PROFILE_NAME_MAX_LENGTH + 1} символов.`;
  }
  if (/\p{C}/u.test(normalized)) return 'Имя содержит недопустимые служебные символы.';

  return null;
}

export function isDefaultPreviewProfileName(value: string): boolean {
  return normalizePreviewProfileName(value) === 'Пользователь ARVELIS';
}
