import { useState } from 'react';
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

  const save = () => {
    onSaveName(name.trim() || 'Пользователь ARVELIS');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
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
          <div className="settings-group__heading"><div><h3>Отображаемое имя</h3><p>Сохраняется только в localStorage браузера.</p></div></div>
          <div className="inline-form"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /><button className="button button--secondary" type="button" onClick={save}>{saved ? 'Сохранено' : 'Сохранить'}</button></div>
        </div>

        <button className="setting-action" type="button" onClick={onOpenStates}>
          <StateIcon /><div><strong>Состояния интерфейса</strong><span>Loading, empty, error, offline и limit для UX-проверки.</span></div><span>Открыть</span>
        </button>

        <button className="setting-action setting-action--danger" type="button" onClick={onReset}>
          <ResetIcon /><div><strong>Сбросить demo-данные</strong><span>Удалит локальные диалоги и восстановит стартовые примеры.</span></div><span>Сбросить</span>
        </button>
      </section>

      <section className="security-note">
        <p className="section-kicker">SECURITY STATUS</p>
        <h3>Секреты и персональные данные не используются.</h3>
        <p>Backend, авторизация, AI-провайдер и серверное хранение пока отсутствуют. Поэтому текущая версия предназначена только для UX-тестирования.</p>
      </section>
    </div>
  );
}
