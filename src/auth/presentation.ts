import type { AuthFailure, AuthFailureCode } from './contracts';

export type AuthFailurePresentation = {
  title: string;
  description: string;
  retryable: boolean;
};

const failureCopy: Record<AuthFailureCode, AuthFailurePresentation> = {
  invalid_input: {
    title: 'Проверьте данные',
    description: 'Исправьте введённые данные и попробуйте ещё раз.',
    retryable: true,
  },
  invalid_challenge: {
    title: 'Код не подошёл',
    description: 'Проверьте код подтверждения или запросите новый.',
    retryable: true,
  },
  challenge_expired: {
    title: 'Время подтверждения истекло',
    description: 'Запустите вход заново, чтобы получить новое подтверждение.',
    retryable: true,
  },
  rate_limited: {
    title: 'Слишком много попыток',
    description: 'Подождите немного перед следующей попыткой.',
    retryable: true,
  },
  account_exists: {
    title: 'Аккаунт уже существует',
    description: 'Этот email уже связан с ARVELIS AI. Перейдите ко входу и получите новый код.',
    retryable: true,
  },
  account_not_found: {
    title: 'Аккаунт не найден',
    description: 'Для этого email ещё нет аккаунта ARVELIS AI. Перейдите к регистрации.',
    retryable: true,
  },
  account_locked: {
    title: 'Доступ временно ограничен',
    description: 'Для защиты аккаунта вход временно ограничен. Используйте восстановление доступа или обратитесь в поддержку.',
    retryable: false,
  },
  network_error: {
    title: 'Нет соединения',
    description: 'Проверьте интернет-соединение и повторите попытку.',
    retryable: true,
  },
  service_unavailable: {
    title: 'Вход временно недоступен',
    description: 'Сервис авторизации сейчас недоступен. Попробуйте позже.',
    retryable: true,
  },
  access_denied: {
    title: 'Не удалось войти',
    description: 'Авторизация была отменена или доступ не разрешён.',
    retryable: true,
  },
  unknown: {
    title: 'Не удалось продолжить',
    description: 'Произошла непредвиденная ошибка. Повторите попытку позже.',
    retryable: true,
  },
};

export function presentAuthFailure(error: AuthFailure): AuthFailurePresentation {
  const base = failureCopy[error.code] ?? failureCopy.unknown;

  if (error.code !== 'rate_limited' || !error.retryAfterSeconds || error.retryAfterSeconds <= 0) {
    return base;
  }

  const seconds = Math.ceil(error.retryAfterSeconds);
  return {
    ...base,
    description: `Повторите попытку примерно через ${seconds} сек.`,
  };
}

export const sessionExpiredPresentation = {
  title: 'Сессия завершена',
  description: 'Для безопасности войдите в ARVELIS AI снова.',
} as const;
