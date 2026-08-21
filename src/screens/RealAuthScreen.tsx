import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AuthStatusPanel } from '../auth/AuthStatusPanel';
import type { AuthIntent, AuthSession, AuthUiState } from '../auth/contracts';
import { realAuthGateway } from '../auth/httpTransport';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';
import { useAuthController } from '../auth/useAuthController';
import { BrandLockup } from '../components/Brand';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const EMAIL_METHOD_ID = 'email_otp';
const OTP_LENGTH = 6;

function intentFromState(state: AuthUiState): AuthIntent {
  switch (state.status) {
    case 'signed_out':
    case 'submitting':
    case 'challenge':
    case 'verifying':
    case 'offline':
    case 'rate_limited':
    case 'error':
      return state.intent;
    default:
      return 'sign_in';
  }
}

export function RealAuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const controller = useAuthController(realAuthGateway);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const deliveredSessionRef = useRef<string | null>(null);
  const online = useOnlineStatus();
  const intent = intentFromState(controller.state);
  const isSignUp = intent === 'sign_up';
  const challenge = controller.state.status === 'challenge' && controller.state.challenge.kind === 'code'
    ? controller.state.challenge
    : controller.state.status === 'verifying'
      ? controller.state.challenge
      : null;
  const emailMethodReady = controller.methodsStatus === 'ready'
    && controller.methods.some((method) => method.id === EMAIL_METHOD_ID && method.enabled && method.identifierType === 'email');
  const busy = controller.state.status === 'checking_session'
    || controller.state.status === 'submitting'
    || controller.state.status === 'verifying';

  useEffect(() => {
    if (controller.state.status !== 'authenticated') return;
    if (deliveredSessionRef.current === controller.state.session.id) return;
    deliveredSessionRef.current = controller.state.session.id;
    onAuthenticated(controller.state.session);
  }, [controller.state, onAuthenticated]);

  const canSubmitIdentifier = useMemo(() => online && emailMethodReady && !busy, [busy, emailMethodReady, online]);

  const switchIntent = (nextIntent: AuthIntent) => {
    if (busy) return;
    controller.setIntent(nextIntent);
    setCode('');
    setFieldError(null);
  };

  const start = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setFieldError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || normalizedEmail.length > 254) {
      setFieldError('Введите корректный email.');
      return;
    }

    if (isSignUp) {
      const nameError = validatePreviewProfileName(displayName);
      if (nameError) {
        setFieldError(nameError);
        return;
      }
    }

    const nextChallenge = await controller.start({
      intent,
      methodId: EMAIL_METHOD_ID,
      identifier: normalizedEmail,
    });
    if (nextChallenge?.kind === 'code') setCode('');
  };

  const complete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError(null);
    if (!challenge) return;

    const normalizedCode = code.trim();
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(normalizedCode)) {
      setFieldError(`Введите ${OTP_LENGTH}-значный код из письма.`);
      return;
    }

    const request = isSignUp
      ? {
          challengeId: challenge.id,
          response: normalizedCode,
          displayName: normalizePreviewProfileName(displayName),
        }
      : {
          challengeId: challenge.id,
          response: normalizedCode,
        };
    await controller.complete(request);
  };

  const resetToIdentifier = () => {
    switchIntent(intent);
  };

  const conflictAction = controller.state.status === 'error'
    && (controller.state.error.code === 'account_exists' || controller.state.error.code === 'account_not_found')
      ? controller.state.error.code
      : null;

  return (
    <main className="auth-shell auth-shell--v2">
      <section className="auth-panel auth-panel--v2">
        <header className="auth-brand">
          <BrandLockup compact />
          <span className="auth-preview-badge auth-preview-badge--secure">SECURE SIGN-IN</span>
        </header>

        {!online ? (
          <div className="auth-network-note" role="status" aria-live="polite">
            <span aria-hidden="true" />
            <p><strong>Нет соединения.</strong> Для входа и получения кода нужен интернет.</p>
          </div>
        ) : null}

        <div className="auth-heading auth-heading--v2">
          <p className="section-kicker">ДОБРО ПОЖАЛОВАТЬ</p>
          <h1>{isSignUp ? 'Создать аккаунт' : 'Войти в ARVELIS AI'}</h1>
          <p>
            {isSignUp
              ? 'Создайте аккаунт по email. Пароль не нужен — владение адресом подтверждается одноразовым кодом.'
              : 'Введите email. Мы отправим одноразовый код для защищённого входа без постоянного пароля.'}
          </p>
        </div>

        <div className="auth-mode-switch" role="group" aria-label="Режим доступа">
          <button
            type="button"
            aria-pressed={!isSignUp}
            className={!isSignUp ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => switchIntent('sign_in')}
            disabled={busy}
          >
            Вход
          </button>
          <button
            type="button"
            aria-pressed={isSignUp}
            className={isSignUp ? 'auth-mode-switch__item auth-mode-switch__item--active' : 'auth-mode-switch__item'}
            onClick={() => switchIntent('sign_up')}
            disabled={busy}
          >
            Регистрация
          </button>
        </div>

        {challenge ? (
          <form className="auth-form auth-form--v2" onSubmit={complete} noValidate>
            <label htmlFor="real-auth-code">
              Код из письма
              <input
                id="real-auth-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH));
                  if (fieldError) setFieldError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                maxLength={OTP_LENGTH}
                placeholder="000000"
                aria-invalid={Boolean(fieldError)}
              />
            </label>
            {fieldError ? <p className="auth-field-error" role="alert">{fieldError}</p> : null}
            <button className="button button--primary auth-submit" type="submit" disabled={busy || code.length !== OTP_LENGTH}>
              {busy ? 'Проверяем…' : 'Подтвердить и продолжить'}
            </button>
            <div className="auth-secondary-actions">
              <button type="button" className="button button--secondary" onClick={() => { void start(); }} disabled={busy || !online}>
                Получить новый код
              </button>
              <button type="button" className="auth-link-button" onClick={resetToIdentifier} disabled={busy}>
                Изменить email
              </button>
            </div>
          </form>
        ) : controller.state.status !== 'authenticated' ? (
          <form className="auth-form auth-form--v2" onSubmit={start} noValidate>
            {isSignUp ? (
              <label htmlFor="real-auth-name">
                Как к вам обращаться
                <input
                  id="real-auth-name"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  maxLength={PREVIEW_PROFILE_NAME_MAX_LENGTH}
                  autoComplete="name"
                  autoCapitalize="words"
                  placeholder="Ваше имя"
                />
              </label>
            ) : null}
            <label htmlFor="real-auth-email">
              Email
              <input
                id="real-auth-email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={254}
                placeholder="name@example.com"
                aria-invalid={Boolean(fieldError)}
              />
            </label>
            {fieldError ? <p className="auth-field-error" role="alert">{fieldError}</p> : null}
            <button className="button button--primary auth-submit" type="submit" disabled={!canSubmitIdentifier}>
              {controller.state.status === 'submitting' ? 'Отправляем код…' : 'Получить код'}
            </button>
          </form>
        ) : null}

        <AuthStatusPanel state={controller.state} />

        {controller.methodsStatus === 'error' ? (
          <section className="auth-status-panel auth-status-panel--error" role="alert">
            <span className="auth-status-panel__signal" aria-hidden="true" />
            <div><strong>Способ входа временно недоступен</strong><p>Не удалось получить актуальные способы входа с сервера.</p></div>
          </section>
        ) : null}

        {conflictAction ? (
          <button
            type="button"
            className="button button--secondary auth-conflict-action"
            onClick={() => switchIntent(conflictAction === 'account_exists' ? 'sign_in' : 'sign_up')}
          >
            {conflictAction === 'account_exists' ? 'Перейти ко входу' : 'Создать аккаунт'}
          </button>
        ) : null}

        <section className="auth-security-note" aria-label="Защита входа">
          <span className="auth-security-note__signal" aria-hidden="true" />
          <div>
            <strong>Одноразовый код · серверная сессия</strong>
            <p>Код действует ограниченное время и используется один раз. Секрет сессии хранится в защищённой HttpOnly cookie и недоступен обычному JavaScript.</p>
          </div>
        </section>

        <p className="auth-legal-note">Не сообщайте код из письма другим людям. ARVELIS AI не запрашивает постоянный пароль для этого способа входа.</p>
      </section>
    </main>
  );
}
