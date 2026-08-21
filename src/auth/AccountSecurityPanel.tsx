import type { AuthSessionSummary } from './contracts';

export function AccountSecurityPanel({
  connected,
  sessions = [],
  onRevokeSession,
}: {
  connected: boolean;
  sessions?: AuthSessionSummary[];
  onRevokeSession?: (sessionId: string) => void;
}) {
  if (!connected) {
    return (
      <section className="account-security-panel" aria-labelledby="account-security-title">
        <div className="account-security-panel__heading">
          <div>
            <p className="section-kicker">АККАУНТ И БЕЗОПАСНОСТЬ</p>
            <h3 id="account-security-title">Защищённый аккаунт ещё не подключён</h3>
            <p>Текущий профиль существует только в frontend preview. Серверные сессии, устройства и восстановление доступа появятся после выбора production auth/backend.</p>
          </div>
          <span className="account-security-panel__status">PREVIEW</span>
        </div>

        <div className="account-security-panel__rows">
          <div className="account-security-row">
            <div><strong>Серверная сессия</strong><span>HttpOnly/session lifecycle будет подключён на backend-этапе.</span></div>
            <span className="account-security-row__state">НЕ ПОДКЛЮЧЕНО</span>
          </div>
          <div className="account-security-row">
            <div><strong>Устройства и сессии</strong><span>Просмотр и отзыв активных входов появятся только с реальными server sessions.</span></div>
            <span className="account-security-row__state">НЕ ПОДКЛЮЧЕНО</span>
          </div>
          <div className="account-security-row">
            <div><strong>Восстановление доступа</strong><span>Способ recovery зависит от утверждённого идентификатора и метода входа.</span></div>
            <span className="account-security-row__state">OPEN</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="account-security-panel" aria-labelledby="account-security-title">
      <div className="account-security-panel__heading">
        <div>
          <p className="section-kicker">АККАУНТ И БЕЗОПАСНОСТЬ</p>
          <h3 id="account-security-title">Активные сессии</h3>
          <p>Управляйте устройствами, на которых открыт ваш аккаунт ARVELIS AI.</p>
        </div>
      </div>

      <div className="account-security-panel__rows">
        {sessions.length === 0 ? (
          <div className="account-security-row account-security-row--empty">
            <div><strong>Нет данных о сессиях</strong><span>Обновите страницу или повторите попытку позже.</span></div>
          </div>
        ) : sessions.map((session) => (
          <div className="account-security-row" key={session.id}>
            <div>
              <strong>{session.deviceLabel || 'Устройство'}{session.current ? ' · текущая сессия' : ''}</strong>
              <span>{session.browserLabel || 'Браузер не определён'}</span>
            </div>
            {!session.current && onRevokeSession ? (
              <button type="button" className="account-security-row__action" onClick={() => onRevokeSession(session.id)}>
                Завершить
              </button>
            ) : <span className="account-security-row__state">{session.current ? 'ТЕКУЩАЯ' : 'АКТИВНА'}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
