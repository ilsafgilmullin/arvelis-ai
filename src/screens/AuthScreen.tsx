import { FormEvent, useState } from 'react';
import { BrandLockup } from '../components/Brand';

type AuthMode = 'signin' | 'signup';

export function AuthScreen({
  initialName,
  onContinue,
}: {
  initialName: string;
  onContinue: (name: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialName === 'Пользователь ARVELIS' ? 'signup' : 'signin');
  const [name, setName] = useState(initialName === 'Пользователь ARVELIS' ? '' : initialName);
  const normalizedName = name.trim();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onContinue(normalizedName || 'Пользователь ARVELIS');
  };

  const isSignIn = mode === 'signin';

  return (
    <main className="auth-shell auth-shell--v2">
      <section className="auth-panel auth-panel--v2">
        <header className="auth-brand">
          <BrandLockup compact />
          <span className="auth-preview-badge">PREVIEW</span>
        </header>

        <div className="auth-heading auth-heading--v2">
          <p className="section-kicker">ДОБРО ПОЖАЛОВАТЬ</p>
          <h1>{isSignIn ? 'Войти в ARVELIS AI' : 'Создать профиль'}</h1>
          <p>
            {isSignIn
              ? 'Продолжите работу с локальным профилем этого устройства. Реальная серверная сессия пока не создаётся.'
              : 'Создайте локальный профиль для проверки приложения. Защищённая учётная запись будет подключена на отдельном backend-этапе.'}
          </p>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="Режим входа">
          <button
            type="button"
            role="tab"
            aria-selected={isSignIn}
            className={isSignIn ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => setMode('signin')}
          >
            Вход
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignIn}
            className={!isSignIn ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => setMode('signup')}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form auth-form--v2" onSubmit={submit}>
          <label>
            Как к вам обращаться
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например: Ильсаф"
              maxLength={80}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
            />
          </label>
          <button className="button button--primary auth-submit" type="submit">
            Продолжить
          </button>
        </form>

        <section className="auth-security-note" aria-label="Статус авторизации">
          <span className="auth-security-note__signal" aria-hidden="true" />
          <div>
            <strong>Локальный preview-доступ</strong>
            <p>Реальная авторизация, серверный аккаунт и сессия пока не подключены. Пароль и другие секреты этот экран не запрашивает.</p>
          </div>
        </section>

        <p className="auth-legal-note">
          Production-условия и политика конфиденциальности будут утверждены до подключения реальных аккаунтов.
        </p>
      </section>
    </main>
  );
}
