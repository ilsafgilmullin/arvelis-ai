import { useState } from 'react';
import { AccountSecurityPanel } from '../auth/AccountSecurityPanel';
import { AuthStatusPanel } from '../auth/AuthStatusPanel';
import type { AuthResourceStatus, AuthSession, AuthSessionSummary, AuthUiState } from '../auth/contracts';
import { Topbar } from '../components/Topbar';
import type { SystemState } from '../types';

const content: Record<SystemState, { label: string; kicker: string; title: string; copy: string }> = {
  loading: { label: 'Загрузка', kicker: 'LOADING', title: 'Обработка запроса', copy: 'В рабочей версии здесь будет отображаться реальное состояние выполнения. Сейчас показан только UX-preview состояния.' },
  empty: { label: 'Пусто', kicker: 'EMPTY', title: 'Пока нет данных', copy: 'Пустое состояние должно объяснять причину и показывать следующий понятный шаг.' },
  error: { label: 'Ошибка', kicker: 'ERROR', title: 'Не удалось выполнить действие', copy: 'Ошибка не скрывается: пользователь получает понятное описание и безопасный способ продолжить работу.' },
  offline: { label: 'Офлайн', kicker: 'OFFLINE', title: 'Нет соединения', copy: 'Локальный интерфейс остаётся доступным, а сетевые функции блокируются до восстановления соединения.' },
  limit: { label: 'Лимит', kicker: 'LIMIT', title: 'Достигнут лимит', copy: 'Это только UX-preview. Тарифы, квоты и биллинг ARVELIS AI ещё не утверждены.' },
};

type AuthPreviewState =
  | 'checking'
  | 'submitting'
  | 'challenge'
  | 'challengeError'
  | 'external'
  | 'verifying'
  | 'signingOut'
  | 'signOutError'
  | 'expired'
  | 'offline'
  | 'rate'
  | 'error';

type AccountSecurityPreviewState = 'disconnected' | 'idle' | 'loading' | 'error' | 'empty' | 'ready';

const authPreviewLabels: Record<AuthPreviewState, string> = {
  checking: 'Проверка',
  submitting: 'Вход',
  challenge: 'Код',
  challengeError: 'Код · ошибка',
  external: 'Провайдер',
  verifying: 'Проверка кода',
  signingOut: 'Выход',
  signOutError: 'Выход · ошибка',
  expired: 'Сессия',
  offline: 'Офлайн',
  rate: 'Лимит',
  error: 'Ошибка',
};

const accountSecurityPreviewLabels: Record<AccountSecurityPreviewState, string> = {
  disconnected: 'Не подключено',
  idle: 'Не загружено',
  loading: 'Загрузка',
  error: 'Ошибка',
  empty: 'Пусто',
  ready: 'Сессии',
};

const previewCodeChallenge = { id: 'preview-code-challenge', methodId: 'preview-method', kind: 'code' as const };
const previewExternalChallenge = {
  id: 'preview-external-challenge',
  methodId: 'preview-external-method',
  kind: 'external_redirect' as const,
  redirectUrl: 'https://example.invalid/authorization',
};
const previewSession: AuthSession = {
  id: 'preview-session',
  account: {
    id: 'preview-account',
    displayName: 'Пользователь preview',
    emailVerified: false,
    phoneVerified: false,
  },
  createdAt: '2026-08-21T08:00:00.000Z',
  expiresAt: '2026-08-22T08:00:00.000Z',
};

const previewAccountSessions: AuthSessionSummary[] = [
  {
    id: 'preview-current-session',
    current: true,
    createdAt: '2026-08-21T08:00:00.000Z',
    lastSeenAt: '2026-08-21T09:00:00.000Z',
    expiresAt: '2026-08-22T08:00:00.000Z',
    deviceLabel: 'Текущее устройство · PREVIEW',
    browserLabel: 'Браузер · PREVIEW',
  },
  {
    id: 'preview-other-session',
    current: false,
    createdAt: '2026-08-20T08:00:00.000Z',
    lastSeenAt: '2026-08-20T14:00:00.000Z',
    expiresAt: '2026-08-23T08:00:00.000Z',
    deviceLabel: 'Дополнительное устройство · PREVIEW',
    browserLabel: 'Браузер · PREVIEW',
  },
];

const authPreviewStates: Record<AuthPreviewState, AuthUiState> = {
  checking: { status: 'checking_session' },
  submitting: { status: 'submitting', intent: 'sign_in', methodId: 'preview-method' },
  challenge: {
    status: 'challenge',
    intent: 'sign_in',
    challenge: previewCodeChallenge,
  },
  challengeError: {
    status: 'challenge',
    intent: 'sign_in',
    challenge: previewCodeChallenge,
    error: { code: 'invalid_challenge', message: 'Internal preview invalid code' },
  },
  external: {
    status: 'challenge',
    intent: 'sign_in',
    challenge: previewExternalChallenge,
  },
  verifying: {
    status: 'verifying',
    intent: 'sign_in',
    challenge: previewCodeChallenge,
  },
  signingOut: {
    status: 'signing_out',
    session: previewSession,
  },
  signOutError: {
    status: 'sign_out_error',
    session: previewSession,
    error: { code: 'service_unavailable', message: 'Internal preview logout error' },
  },
  expired: { status: 'session_expired' },
  offline: { status: 'offline', intent: 'sign_in' },
  rate: { status: 'rate_limited', intent: 'sign_in', retryAfterSeconds: 30 },
  error: {
    status: 'error',
    intent: 'sign_up',
    error: { code: 'service_unavailable', message: 'Internal preview error' },
  },
};

function accountSecurityPreviewProps(state: AccountSecurityPreviewState): {
  connected: boolean;
  sessions?: AuthSessionSummary[];
  sessionsStatus?: AuthResourceStatus;
} {
  switch (state) {
    case 'disconnected':
      return { connected: false };
    case 'idle':
      return { connected: true, sessionsStatus: 'idle' };
    case 'loading':
      return { connected: true, sessionsStatus: 'loading' };
    case 'error':
      return { connected: true, sessionsStatus: 'error' };
    case 'empty':
      return { connected: true, sessionsStatus: 'ready', sessions: [] };
    case 'ready':
      return { connected: true, sessionsStatus: 'ready', sessions: previewAccountSessions };
  }
}

export function StatesScreen() {
  const [state, setState] = useState<SystemState>('loading');
  const [authState, setAuthState] = useState<AuthPreviewState>('checking');
  const [accountSecurityState, setAccountSecurityState] = useState<AccountSecurityPreviewState>('disconnected');
  const selected = content[state];
  const accountSecurityProps = accountSecurityPreviewProps(accountSecurityState);

  return (
    <div className="content-page">
      <Topbar title="Системные состояния" subtitle="Внутренний QA-экран frontend preview" />

      <section aria-labelledby="system-state-heading">
        <p className="section-kicker">ОБЩИЕ СОСТОЯНИЯ</p>
        <h2 className="state-section-title" id="system-state-heading">Интерфейс</h2>
        <div className="state-tabs" role="group" aria-label="Системные состояния">
          {(Object.keys(content) as SystemState[]).map((item) => (
            <button
              type="button"
              aria-pressed={state === item}
              key={item}
              className={state === item ? 'state-tab state-tab--active' : 'state-tab'}
              onClick={() => setState(item)}
            >
              {content[item].label}
            </button>
          ))}
        </div>
        <section className={`state-preview state-preview--${state}`} aria-live="polite">
          <div className="state-preview__signal" aria-hidden="true" />
          <p className="section-kicker">{selected.kicker} · PREVIEW</p>
          <h2>{selected.title}</h2>
          <p>{selected.copy}</p>
        </section>
      </section>

      <section className="auth-state-qa" aria-labelledby="auth-state-heading">
        <p className="section-kicker">AUTH UI · PREVIEW</p>
        <h2 className="state-section-title" id="auth-state-heading">Авторизация и сессия</h2>
        <p className="auth-state-qa__copy">Компоненты ниже показывают только будущие UX-состояния. Реальный backend, OTP, provider redirect и server session не подключены.</p>
        <div className="state-tabs" role="group" aria-label="Состояния авторизации">
          {(Object.keys(authPreviewStates) as AuthPreviewState[]).map((item) => (
            <button
              type="button"
              aria-pressed={authState === item}
              key={item}
              className={authState === item ? 'state-tab state-tab--active' : 'state-tab'}
              onClick={() => setAuthState(item)}
            >
              {authPreviewLabels[item]}
            </button>
          ))}
        </div>
        <AuthStatusPanel state={authPreviewStates[authState]} />
      </section>

      <section className="auth-state-qa" aria-labelledby="account-security-state-heading">
        <p className="section-kicker">ACCOUNT SECURITY · PREVIEW</p>
        <h2 className="state-section-title" id="account-security-state-heading">Устройства и сессии</h2>
        <p className="auth-state-qa__copy">Это только QA-представление будущего server-session UI. Список ниже не является данными реального аккаунта, а действия отзыва сессии намеренно не подключены.</p>
        <div className="state-tabs" role="group" aria-label="Состояния устройств и сессий">
          {(Object.keys(accountSecurityPreviewLabels) as AccountSecurityPreviewState[]).map((item) => (
            <button
              type="button"
              aria-pressed={accountSecurityState === item}
              key={item}
              className={accountSecurityState === item ? 'state-tab state-tab--active' : 'state-tab'}
              onClick={() => setAccountSecurityState(item)}
            >
              {accountSecurityPreviewLabels[item]}
            </button>
          ))}
        </div>
        <AccountSecurityPanel {...accountSecurityProps} />
      </section>
    </div>
  );
}
