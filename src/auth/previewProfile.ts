export const PREVIEW_PROFILE_NAME_MAX_LENGTH = 80;
const DEFAULT_PREVIEW_PROFILE_NAME = 'Пользователь ARVELIS';

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
  if (normalized === DEFAULT_PREVIEW_PROFILE_NAME) return 'Это имя зарезервировано интерфейсом ARVELIS AI. Выберите другое.';

  return null;
}

export function isDefaultPreviewProfileName(value: string): boolean {
  return normalizePreviewProfileName(value) === DEFAULT_PREVIEW_PROFILE_NAME;
}
