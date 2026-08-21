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
    return (
      <section className="account-security-panel" aria-labelledby="account-security-title">
        <div className="account-security-panel__heading">
          <div>
            <p className="section-kicker">АККАУНТ И БЕЗОПАСНОСТЬ</p>
            <h3 id="account-security-title">Защищённый аккаунт ещё не подключён</h3>
            <p>Сейчас профиль хранится только на этом устройстве. После подключения настоящего аккаунта здесь появятся управление входами, устройствами и восстановлением доступа.</p>
          </div>
          <span className="account-security-panel__status">PREVIEW</span>
        </div>

        <div className="account-security-panel__rows">
          <div className="account-security-row">
            <div><strong>Защищённый вход</strong><span>Серверная авторизация будет подключена отдельным этапом.</span></div>
            <span className="account-security-row__state">НЕ ПОДКЛЮЧЕНО</span>
          </div>
          <div className="account-security-row">
            <div><strong>Устройства и сессии</strong><span>Здесь можно будет увидеть активные входы и завершить лишнюю сессию.</span></div>
            <span className="account-security-row__state">НЕ ПОДКЛЮЧЕНО</span>
          </div>
          <div className="account-security-row">
            <div><strong>Восстановление доступа</strong><span>Способ восстановления будет определён вместе с основным способом входа.</span></div>
            <span className="account-security-row__state">OPEN</span>
          </div>
        </div>
      </section>
    );
  }

  const sessionContent = (() => {
    if (sessionsStatus === 'loading') {
      return (
        <div className="account-security-row account-security-row--empty" role="status" aria-live="polite">
          <div><strong>Загружаем активные сессии</strong><span>Проверяем устройства, на которых открыт аккаунт.</span></div>
          <span className="account-security-row__state">ЗАГРУЗКА</span>
        </div>
      );
    }

    if (sessionsStatus === 'error') {
      return (
        <div className="account-security-row account-security-row--empty" role="alert">
          <div><strong>Не удалось получить список сессий</strong><span>Это не означает, что других активных устройств нет.</span></div>
          {onRefreshSessions ? (
            <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Повторить</button>
          ) : <span className="account-security-row__state">ОШИБКА</span>}
        </div>
      );
    }

    if (sessionsStatus === 'idle') {
      return (
        <div className="account-security-row account-security-row--empty">
          <div><strong>Список сессий ещё не загружен</strong><span>Запросите актуальные данные перед управлением устройствами.</span></div>
          {onRefreshSessions ? (
            <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Обновить</button>
          ) : null}
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <div className="account-security-row account-security-row--empty" role="status">
          <div><strong>Список активных сессий пуст</strong><span>Повторите загрузку, если текущая сессия должна отображаться.</span></div>
          {onRefreshSessions ? (
            <button type="button" className="account-security-row__action" onClick={onRefreshSessions}>Обновить</button>
          ) : null}
        </div>
      );
    }

    return sessions.map((session) => (
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
    ));
  })();

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
        {sessionContent}
      </div>
    </section>
  );
}
