import { FormEvent, useState } from 'react';
import { AccountSecurityPanel } from '../auth/AccountSecurityPanel';
import type { AuthResourceStatus, AuthSessionSummary } from '../auth/contracts';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';

export function ProfileScreen({
  profileName,
  persistenceAvailable,
  authMode = 'preview',
  primaryEmail,
  sessions = [],
  sessionsStatus = 'idle',
  signOutPending = false,
  signOutError = false,
  onSaveName,
  onRefreshSessions,
  onRevokeSession,
  onOpenStates,
  onSignOut,
  onReset,
}: {
  profileName: string;
  persistenceAvailable: boolean;
  authMode?: 'preview' | 'server';
  primaryEmail?: string;
  sessions?: AuthSessionSummary[];
  sessionsStatus?: AuthResourceStatus;
  signOutPending?: boolean;
  signOutError?: boolean;
  onSaveName: (name: string) => void;
  onRefreshSessions?: () => void;
  onRevokeSession?: (sessionId: string) => void;
  onOpenStates: () => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(profileName);
  const [editOpen, setEditOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const normalizedName = normalizePreviewProfileName(name);
  const rawChanged = name !== profileName;
  const normalizedChanged = normalizedName !== profileName;
  const profileInitial = profileName.slice(0, 1).toLocaleUpperCase('ru-RU') || 'A';
  const serverAccount = authMode === 'server';
  void persistenceAvailable;
  void onOpenStates;
  void onReset;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (serverAccount) return;
    const error = validatePreviewProfileName(name);
    if (error) {
      setValidationMessage(error);
      setSaved(false);
      return;
    }
    setName(normalizedName);
    setValidationMessage(null);
    if (!normalizedChanged) {
      setEditOpen(false);
      return;
    }
    onSaveName(normalizedName);
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      setEditOpen(false);
    }, 900);
  };

  return (
    <div className="travel-profile">
      <header className="travel-profile__hero">
        <div className="travel-profile__avatar" aria-hidden="true">{profileInitial}</div>
        <div className="travel-profile__identity">
          <p className="travel-kicker">ПРОФИЛЬ</p>
          <h1>{profileName}</h1>
          <p>{primaryEmail ?? (serverAccount ? 'ARVELIS account' : 'Локальный профиль')}</p>
        </div>
        {serverAccount ? (
          <span className="travel-profile__account-state">Аккаунт подтверждён</span>
        ) : (
          <button className="travel-secondary travel-secondary--compact" type="button" onClick={() => setEditOpen((value) => !value)} aria-expanded={editOpen} aria-controls="travel-profile-editor">
            Редактировать профиль
          </button>
        )}
      </header>

      {editOpen && !serverAccount ? (
        <form id="travel-profile-editor" className="travel-profile__editor" onSubmit={save} noValidate>
          <label htmlFor="profile-display-name">Имя</label>
          <div>
            <input
              id="profile-display-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
                if (validationMessage) setValidationMessage(null);
              }}
              maxLength={PREVIEW_PROFILE_NAME_MAX_LENGTH}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="done"
              aria-invalid={Boolean(validationMessage)}
              aria-describedby={validationMessage ? 'profile-name-error' : undefined}
            />
            <button className="travel-primary travel-primary--compact" type="submit" disabled={!rawChanged && !validationMessage}>{saved ? 'Сохранено' : 'Сохранить'}</button>
          </div>
          {validationMessage ? <p className="travel-field-error" id="profile-name-error" role="alert">{validationMessage}</p> : null}
        </form>
      ) : null}

      <section className="travel-profile__grid" aria-label="Разделы профиля">
        <ProfileSection title="Личные данные" text={serverAccount ? 'Имя и email вашего аккаунта.' : 'Имя локального профиля на этом устройстве.'} />
        <ProfileSection title="Настройки поездок" text="Предпочтения, валюта и единицы будут управляться через настройки." />
        <ProfileSection title="Мои документы" text="Документный контур пока пуст и не содержит демонстрационных файлов." />
        <ProfileSection title="Уведомления" text="Уведомления пока не подключены." />
        <ProfileSection title="Конфиденциальность" text="Управление экспортом и удалением данных будет расширено отдельным этапом." />
        <ProfileSection title="Помощь" text="Справка доступна из основного меню ARVELIS AI." />
        <ProfileSection title="О приложении" text="ARVELIS AI · AI-first Travel Assistant." />
      </section>

      <details className="travel-profile__security">
        <summary>Безопасность</summary>
        <AccountSecurityPanel
          connected={serverAccount}
          sessions={sessions}
          sessionsStatus={sessionsStatus}
          onRefreshSessions={onRefreshSessions}
          onRevokeSession={onRevokeSession}
        />
      </details>

      {signOutError ? <div className="travel-alert" role="alert">Не удалось завершить серверную сессию. Аккаунт остаётся активным.</div> : null}

      <div className="travel-profile__logout">
        <button className="travel-secondary" type="button" onClick={onSignOut} disabled={signOutPending}>{signOutPending ? 'Выходим…' : 'Выйти'}</button>
      </div>


    </div>
  );
}

function ProfileSection({ title, text }: { title: string; text: string }) {
  return <article className="travel-profile__section"><h2>{title}</h2><p>{text}</p></article>;
}
