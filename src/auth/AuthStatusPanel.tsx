import type { AuthUiState } from './contracts';
import { presentAuthFailure, sessionExpiredPresentation } from './presentation';

export function AuthStatusPanel({ state }: { state: AuthUiState }) {
  if (state.status === 'signed_out' || state.status === 'authenticated') return null;

  if (state.status === 'checking_session') {
    return (
      <section className="auth-status-panel auth-status-panel--loading" role="status" aria-live="polite">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>Проверяем сессию</strong><p>ARVELIS AI проверяет, можно ли безопасно продолжить без повторного входа.</p></div>
      </section>
    );
  }

  if (state.status === 'submitting') {
    return (
      <section className="auth-status-panel auth-status-panel--loading" role="status" aria-live="polite">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>Продолжаем вход</strong><p>Не закрывайте окно, пока запрос авторизации обрабатывается.</p></div>
      </section>
    );
  }

  if (state.status === 'challenge') {
    return (
      <section className="auth-status-panel" role="status" aria-live="polite">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div>
          <strong>Нужно подтверждение</strong>
          <p>{state.challenge.maskedDestination ? `Подтверждение отправлено: ${state.challenge.maskedDestination}` : 'Завершите выбранный способ подтверждения, чтобы продолжить.'}</p>
        </div>
      </section>
    );
  }

  if (state.status === 'session_expired') {
    return (
      <section className="auth-status-panel auth-status-panel--warning" role="alert">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>{sessionExpiredPresentation.title}</strong><p>{sessionExpiredPresentation.description}</p></div>
      </section>
    );
  }

  if (state.status === 'offline') {
    return (
      <section className="auth-status-panel auth-status-panel--warning" role="status" aria-live="polite">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>Нет соединения</strong><p>Восстановите интернет-соединение и повторите вход.</p></div>
      </section>
    );
  }

  if (state.status === 'rate_limited') {
    const seconds = state.retryAfterSeconds && state.retryAfterSeconds > 0 ? Math.ceil(state.retryAfterSeconds) : null;
    return (
      <section className="auth-status-panel auth-status-panel--warning" role="alert">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>Слишком много попыток</strong><p>{seconds ? `Повторите попытку примерно через ${seconds} сек.` : 'Подождите немного перед следующей попыткой.'}</p></div>
      </section>
    );
  }

  if (state.status === 'error') {
    const presentation = presentAuthFailure(state.error);
    return (
      <section className="auth-status-panel auth-status-panel--error" role="alert">
        <span className="auth-status-panel__signal" aria-hidden="true" />
        <div><strong>{presentation.title}</strong><p>{presentation.description}</p></div>
      </section>
    );
  }

  return null;
}
