import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResetIcon, StateIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';

export function ProfileScreen({
  profileName,
  onSaveName,
  onOpenStates,
  onReset,
}: {
  profileName: string;
  onSaveName: (name: string) => void;
  onOpenStates: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(profileName);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const save = () => {
    onSaveName(name.trim() || 'Пользователь ARVELIS');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const reset = () => {
    setConfirmReset(false);
    onReset();
  };

  return (
    <div className="content-page">
      <Topbar title="Профиль и настройки" subtitle="Только локальные настройки тестовой версии." />

      <section className="profile-overview">
        <div className="profile-avatar">A</div>
        <div><p className="section-kicker">LOCAL DEMO PROFILE</p><h2>{profileName}</h2><span>Учётная запись не создана</span></div>
      </section>

      <section className="settings-panel">
        <div className="settings-group">
          <div className="settings-group__heading"><div><h3>Отображаемое имя</h3><p>При доступном localStorage сохраняется только в этом браузере.</p></div></div>
          <div className="inline-form">
            <input aria-label="Отображаемое имя" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
            <button className="button button--secondary" type="button" onClick={save}>{saved ? 'Сохранено' : 'Сохранить'}</button>
          </div>
        </div>

        <button className="setting-action" type="button" onClick={onOpenStates}>
          <StateIcon /><div><strong>Состояния интерфейса</strong><span>Loading, empty, error, offline и limit для UX-проверки.</span></div><span>Открыть</span>
        </button>

        <button className="setting-action setting-action--danger" type="button" onClick={() => setConfirmReset(true)}>
          <ResetIcon /><div><strong>Сбросить demo-данные</strong><span>Удалит локальные диалоги и восстановит стартовые примеры.</span></div><span>Сбросить</span>
        </button>
      </section>

      <section className="security-note">
        <p className="section-kicker">SECURITY STATUS</p>
        <h3>Секреты и персональные данные не используются.</h3>
        <p>Backend, авторизация, AI-провайдер и серверное хранение пока отсутствуют. Поэтому текущая версия предназначена только для UX-тестирования.</p>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить локальные demo-данные?"
        description="Все созданные в этом браузере demo-диалоги и изменённое имя будут удалены. Затем восстановятся стартовые примеры."
        confirmLabel="Сбросить данные"
        danger
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
