import { useState } from 'react';
import { AuthStatusPanel } from '../auth/AuthStatusPanel';
import type { AuthSession, AuthUiState } from '../auth/contracts';
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
  offline: { status: 'offline' },
  rate: { status: 'rate_limited', retryAfterSeconds: 30 },
  error: {
    status: 'error',
    error: { code: 'service_unavailable', message: 'Internal preview error' },
  },
};

export function StatesScreen() {
  const [state, setState] = useState<SystemState>('loading');
  const [authState, setAuthState] = useState<AuthPreviewState>('checking');
  const selected = content[state];

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
    </div>
  );
}
