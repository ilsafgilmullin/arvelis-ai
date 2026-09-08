import type { AuthResourceStatus, AuthSessionSummary } from './contracts';

export function AccountSecurityPanel({
  connected,
  sessions = [],
  sessionsStatus = 'idle',
  onRefreshSessions,
  onRevokeSession,
}: {
  connected: boolean;
  sessions?: AuthSessionSummary[];
  sessionsStatus?: AuthResourceStatus;
  onRefreshSessions?: () => void;
  onRevokeSession?: (sessionId: string) => void;
}) {
  if (!connected) {
    return <section className="account-security-panel" aria-labelledby="account-security-title">
      <div className="account-security-panel__heading">
        <div>
          <p className="section-kicker">БЕЗОПАСНОСТЬ</p>
          <h3 id="account-security-title">Управление аккаунтом недоступно</h3>
          <p>В предварительной версии профиль используется только на этом устройстве.</p>
        </div>
      </div>
      <div className="account-security-panel__rows">
        <div className="account-security-row">
          <div><strong>Вход</strong><span>Управление способами входа появится после подключения аккаунта.</span></div>
          <span className="account-security-row__state">НЕДОСТУПНО</span>
        </div>
        <div className="account-security-row">
          <div><strong>Устройства</strong><span>Здесь можно будет увидеть активные входы и завершить лишние.</span></div>
          <span className="account-security-row__state">НЕДОСТУПНО</span>
        </div>
        <div className="account-security-row">
          <div><strong>Восстановление доступа</strong><span>Настройки восстановления появятся вместе с аккаунтом.</span></div>
          <span className="account-security-row__state">НЕДОСТУПНО</span>
        </div>
      </div>
    </section>;
  }

  const sessionContent = (() => {
    if (sessionsStatus === 'loading') {
      return <div className="account-security-row account-security-row--empty" role="status" aria-live="polite">
        <div><strong>Загружаем активные входы</strong><span>Проверяем устройства, на которых открыт аккаунт.</span></div>
        <span className="account-security-row__state">ЗАГРУЗКА</span>
      </div>;
    }

    if (sessionsStatus === 'error') {
      return <div className="account-security-row account-security-row--empty" role="alert">
        <div><strong>Не удалось получить список устройств</strong><span>Повторите попытку, чтобы увидеть актуальные данные.</span></div>
        {onRefreshSessions ? <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Повторить</button> : <span className="account-security-row__state">ОШИБКА</span>}
      </div>;
    }

    if (sessionsStatus === 'idle') {
      return <div className="account-security-row account-security-row--empty">
        <div><strong>Устройства ещё не загружены</strong><span>Обновите список перед управлением входами.</span></div>
        {onRefreshSessions ? <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Обновить</button> : null}
      </div>;
    }

    if (sessions.length === 0) {
      return <div className="account-security-row account-security-row--empty" role="status">
        <div><strong>Активные устройства не найдены</strong><span>Обновите список, если текущий вход должен отображаться.</span></div>
        {onRefreshSessions ? <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Обновить</button> : null}
      </div>;
    }

    return sessions.map((session) => <div className="account-security-row" key={session.id}>
      <div>
        <strong>{session.deviceLabel || 'Устройство'}{session.current ? ' · текущее' : ''}</strong>
        <span>{session.browserLabel || 'Браузер не определён'}</span>
      </div>
      {!session.current && onRevokeSession
        ? <button type="button" className="account-security-row__action" onClick={() => onRevokeSession(session.id)}>Завершить</button>
        : <span className="account-security-row__state">{session.current ? 'ТЕКУЩЕЕ' : 'АКТИВНО'}</span>}
    </div>);
  })();

  return <section className="account-security-panel" aria-labelledby="account-security-title">
    <div className="account-security-panel__heading">
      <div>
        <p className="section-kicker">БЕЗОПАСНОСТЬ</p>
        <h3 id="account-security-title">Активные устройства</h3>
        <p>Управляйте устройствами, на которых открыт ваш аккаунт ARVELIS AI.</p>
      </div>
    </div>
    <div className="account-security-panel__rows">{sessionContent}</div>
  </section>;
}
