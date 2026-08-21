import { FormEvent, useState } from 'react';
import { BrandLockup } from '../components/Brand';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  isDefaultPreviewProfileName,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';

type AuthMode = 'signin' | 'signup';

export function AuthScreen({
  initialName,
  onContinue,
}: {
  initialName: string;
  onContinue: (name: string) => void;
}) {
  const initialProfileName = normalizePreviewProfileName(initialName);
  const hasLocalProfile = Boolean(initialProfileName) && !isDefaultPreviewProfileName(initialProfileName);
  const [mode, setMode] = useState<AuthMode>(hasLocalProfile ? 'signin' : 'signup');
  const [name, setName] = useState(hasLocalProfile ? initialProfileName : '');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const online = useOnlineStatus();
  const isSignIn = mode === 'signin';

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setValidationMessage(null);
  };

  const continueExistingProfile = () => {
    if (!hasLocalProfile) {
      selectMode('signup');
      return;
    }
    onContinue(initialProfileName);
  };

  const submitRegistration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasLocalProfile) return;

    const error = validatePreviewProfileName(name);
    if (error) {
      setValidationMessage(error);
      return;
    }

    onContinue(normalizePreviewProfileName(name));
  };

  return (
    <main className="auth-shell auth-shell--v2">
      <section className="auth-panel auth-panel--v2">
        <header className="auth-brand">
          <BrandLockup compact />
          <span className="auth-preview-badge">PREVIEW</span>
        </header>

        {!online ? (
          <div className="auth-network-note" role="status" aria-live="polite">
            <span aria-hidden="true" />
            <p><strong>Вы офлайн.</strong> Локальную тестовую версию можно открыть, но настоящий вход будет требовать соединение.</p>
          </div>
        ) : null}

        <div className="auth-heading auth-heading--v2">
          <p className="section-kicker">ДОБРО ПОЖАЛОВАТЬ</p>
          <h1>{isSignIn ? 'Войти в ARVELIS AI' : 'Создать профиль'}</h1>
          <p>
            {isSignIn
              ? hasLocalProfile
                ? 'На этом устройстве найден локальный профиль. Продолжите работу с сохранёнными диалогами.'
                : 'Локальный профиль на этом устройстве ещё не создан.'
              : hasLocalProfile
                ? 'В текущей тестовой версии доступен один локальный профиль на устройство.'
                : 'Укажите имя для тестового профиля. Настоящий аккаунт и защищённая сессия появятся после подключения серверной авторизации.'}
          </p>
        </div>

        <div className="auth-mode-switch" role="group" aria-label="Режим доступа">
          <button
            type="button"
            aria-pressed={isSignIn}
            className={isSignIn ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => selectMode('signin')}
          >
            Вход
          </button>
          <button
            type="button"
            aria-pressed={!isSignIn}
            className={!isSignIn ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => selectMode('signup')}
          >
            Регистрация
          </button>
        </div>

        {isSignIn ? (
          hasLocalProfile ? (
            <section className="auth-local-profile" aria-label="Локальный профиль">
              <div className="auth-local-profile__avatar" aria-hidden="true">
                {initialProfileName.slice(0, 1).toLocaleUpperCase('ru-RU') || 'A'}
              </div>
              <div className="auth-local-profile__copy">
                <span>Профиль на этом устройстве</span>
                <strong>{initialProfileName}</strong>
                <p>История и настройки этого профиля пока хранятся только в браузере на этом устройстве.</p>
              </div>
              <button className="button button--primary auth-submit" type="button" onClick={continueExistingProfile}>
                Продолжить
              </button>
            </section>
          ) : (
            <section className="auth-empty-profile" role="status">
              <span className="auth-empty-profile__mark" aria-hidden="true">A</span>
              <div><strong>Профиль не найден</strong><p>Создайте локальный профиль, чтобы открыть тестовую версию ARVELIS AI.</p></div>
              <button className="button button--primary" type="button" onClick={() => selectMode('signup')}>
                Создать профиль
              </button>
            </section>
          )
        ) : hasLocalProfile ? (
          <section className="auth-single-profile-note" role="status">
            <strong>Новый локальный профиль сейчас не создаётся поверх существующего.</strong>
            <p>Так тестовая версия не смешивает два профиля в одном хранилище браузера. Позже реальные аккаунты и переключение между ними будут работать через серверную авторизацию.</p>
            <button className="button button--secondary" type="button" onClick={() => selectMode('signin')}>
              Вернуться ко входу
            </button>
          </section>
        ) : (
          <form className="auth-form auth-form--v2" onSubmit={submitRegistration} noValidate>
            <label htmlFor="preview-profile-name">
              Как к вам обращаться
              <input
                id="preview-profile-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (validationMessage) setValidationMessage(null);
                }}
                placeholder="Например: Ильсаф"
                maxLength={PREVIEW_PROFILE_NAME_MAX_LENGTH}
                autoComplete="nickname"
                autoCapitalize="words"
                enterKeyHint="go"
                aria-invalid={Boolean(validationMessage)}
                aria-describedby={validationMessage ? 'preview-profile-name-error' : undefined}
              />
            </label>
            {validationMessage ? (
              <p className="auth-field-error" id="preview-profile-name-error" role="alert">{validationMessage}</p>
            ) : null}
            <button className="button button--primary auth-submit" type="submit">
              Продолжить
            </button>
          </form>
        )}

        <section className="auth-security-note" aria-label="Статус авторизации">
          <span className="auth-security-note__signal" aria-hidden="true" />
          <div>
            <strong>Локальный тестовый доступ</strong>
            <p>Настоящая авторизация и серверная сессия ещё не подключены. Email, пароль, коды подтверждения и внешние способы входа не выдаются за работающие.</p>
          </div>
        </section>

        <p className="auth-legal-note">
          Условия использования, политика конфиденциальности и способы входа будут утверждены до подключения реальных аккаунтов.
        </p>
      </section>
    </main>
  );
}
