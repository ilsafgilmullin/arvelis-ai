import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResetIcon, SignOutIcon, StateIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';

export function ProfileScreen({
  profileName,
  onSaveName,
  onOpenStates,
  onSignOut,
  onReset,
}: {
  profileName: string;
  onSaveName: (name: string) => void;
  onOpenStates: () => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(profileName);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const normalizedName = name.trim() || 'Пользователь ARVELIS';
  const changed = normalizedName !== profileName;

  const save = () => {
    if (!changed) return;
    onSaveName(normalizedName);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const reset = () => {
    setConfirmReset(false);
    onReset();
  };

  return (
    <div className="content-page">
      <Topbar title="Профиль" subtitle="Ваши настройки ARVELIS AI" />

      <section className="profile-overview">
        <div className="profile-avatar">A</div>
        <div><p className="section-kicker">ПРОФИЛЬ</p><h2>{profileName}</h2><span>Локальный preview-профиль этого устройства</span></div>
      </section>

      <section className="settings-panel">
        <div className="settings-group">
          <div className="settings-group__heading"><div><h3>Отображаемое имя</h3><p>Используется в приветствии и интерфейсе. В текущей версии сохраняется только на этом устройстве.</p></div></div>
          <div className="inline-form">
            <input
              aria-label="Отображаемое имя"
              value={name}
              onChange={(event) => { setName(event.target.value); setSaved(false); }}
              maxLength={80}
              autoComplete="nickname"
            />
            <button className="button button--secondary" type="button" onClick={save} disabled={!changed}>{saved ? 'Сохранено' : 'Сохранить'}</button>
          </div>
        </div>

        <button className="setting-action" type="button" onClick={onSignOut}>
          <SignOutIcon /><div><strong>Выйти из preview-профиля</strong><span>Вернёт на экран входа. Локальные диалоги и настройки останутся на этом устройстве.</span></div><span>Выйти</span>
        </button>

        <button className="setting-action" type="button" onClick={onOpenStates}>
          <StateIcon /><div><strong>Диагностика preview</strong><span>Проверка состояний loading, empty, error, offline и limit.</span></div><span>Открыть</span>
        </button>

        <button className="setting-action setting-action--danger" type="button" onClick={() => setConfirmReset(true)}>
          <ResetIcon /><div><strong>Сбросить локальные данные</strong><span>Удалит локальные диалоги, имя и вернёт стартовые примеры.</span></div><span>Сбросить</span>
        </button>
      </section>

      <section className="security-note">
        <p className="section-kicker">АККАУНТ И БЕЗОПАСНОСТЬ</p>
        <h3>Серверная учётная запись пока не подключена.</h3>
        <p>Текущий выход завершает только локальную preview-сессию интерфейса и не удаляет данные. Production-версия получит отдельные server sessions, управление устройствами, восстановление доступа и отзыв сессий.</p>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить локальные данные?"
        description="Все созданные в этом браузере диалоги и изменённое имя будут удалены. Затем восстановятся стартовые примеры."
        confirmLabel="Сбросить данные"
        danger
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
