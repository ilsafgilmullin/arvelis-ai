import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ControlApp } from './ControlApp';

export function ControlRuntime() {
  const online = useOnlineStatus();

  return (
    <>
      {!online ? (
        <div className="control-offline-banner" role="status" aria-live="polite">
          Нет соединения. CONTROL preview остаётся доступен, но серверные операции после backend потребуют сеть.
        </div>
      ) : null}
      <ControlApp />
    </>
  );
}
