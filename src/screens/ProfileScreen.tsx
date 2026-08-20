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
      <Topbar title="Профиль и настройки" subtitle="Локальные параметры frontend preview" />

      <section className="profile-overview">
        <div className="profile-avatar">A</div>
        <div><p className="section-kicker">LOCAL PREVIEW PROFILE</p><h2>{profileName}</h2><span>Реальная учётная запись не создана</span></div>
      </section>

      <section className="settings-panel">
        <div className="settings-group">
          <div className="settings-group__heading"><div><h3>Отображаемое имя</h3><p>Используется только в интерфейсе preview. При доступном localStorage сохраняется в этом браузере.</p></div></div>
          <div className="inline-form">
            <input
              aria-label="Отображаемое имя"
              value={name}
              onChange={(event) => { setName(event.target.value); setSaved(false); }}
              maxLength={80}
            />
            <button className="button button--secondary" type="button" onClick={save} disabled={!changed}>{saved ? 'Сохранено' : 'Сохранить'}</button>
          </div>
        </div>

        <button className="setting-action" type="button" onClick={onOpenStates}>
          <StateIcon /><div><strong>Состояния интерфейса</strong><span>Внутренний QA-экран: loading, empty, error, offline и limit.</span></div><span>Открыть</span>
        </button>

        <button className="setting-action setting-action--danger" type="button" onClick={() => setConfirmReset(true)}>
          <ResetIcon /><div><strong>Сбросить preview-данные</strong><span>Удалит локальные диалоги и восстановит стартовые примеры.</span></div><span>Сбросить</span>
        </button>
      </section>

      <section className="security-note">
        <p className="section-kicker">SECURITY STATUS</p>
        <h3>В preview нет реальной авторизации и серверного профиля.</h3>
        <p>AI-провайдер, backend и серверное хранение пока не подключены. Email, пароли, API-ключи и другие секреты интерфейс не запрашивает.</p>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить локальные preview-данные?"
        description="Все созданные в этом браузере диалоги и изменённое имя будут удалены. Затем восстановятся стартовые примеры."
        confirmLabel="Сбросить данные"
        danger
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
