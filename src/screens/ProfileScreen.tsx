import { type FormEvent, useState } from 'react';
import { AccountSecurityPanel } from '../auth/AccountSecurityPanel';
import type { AuthResourceStatus, AuthSessionSummary } from '../auth/contracts';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';

type ProfileIconName = 'person' | 'sliders' | 'document' | 'bell' | 'shield' | 'lock' | 'help' | 'info';

function ProfileIcon({ name }: { name: ProfileIconName }) {
  const paths: Record<ProfileIconName, string[]> = {
    person: ['M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M4.5 17c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5'],
    sliders: ['M4 6h12', 'M4 14h12', 'M8 4v4', 'M13 12v4'],
    document: ['M6 3.5h6l3 3V17H6z', 'M12 3.5V7h3', 'M8 10h5', 'M8 13h5'],
    bell: ['M6 8a4 4 0 0 1 8 0v3l1.5 2H4.5L6 11z', 'M8.5 15.5h3'],
    shield: ['M10 3.5 15 5v4.5c0 3.2-2 5.8-5 7-3-1.2-5-3.8-5-7V5z', 'm7.5 10 1.5 1.5 3.5-3.5'],
    lock: ['M6 9V7a4 4 0 0 1 8 0v2', 'M5 9h10v8H5z'],
    help: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'M8.2 8a1.9 1.9 0 1 1 2.5 1.8c-.9.4-1.3 1-1.3 1.8', 'M10 14h.01'],
    info: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14', 'M10 9v5', 'M10 6.5h.01'],
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true">{paths[name].map((path) => <path key={path} d={path} />)}</svg>;
}

function ProfileMenuRow({ icon, title, onClick, expanded }: {
  icon: ProfileIconName;
  title: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const content = <>
    <span className="travel-profile__menu-icon"><ProfileIcon name={icon} /></span>
    <strong>{title}</strong>
    <span className="travel-profile__chevron" aria-hidden="true">›</span>
  </>;
  return onClick
    ? <button type="button" className="travel-profile__menu-row" onClick={onClick} aria-expanded={expanded}>{content}</button>
    : <div className="travel-profile__menu-row travel-profile__menu-row--static">{content}</div>;
}

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
  const [securityOpen, setSecurityOpen] = useState(false);
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

  return <div className="travel-profile">
    <header className="travel-profile__hero">
      <div className="travel-profile__avatar" aria-hidden="true">{profileInitial}</div>
      <div className="travel-profile__identity">
        <p className="travel-kicker">ПРОФИЛЬ</p>
        <h1>{profileName}</h1>
        <p>{primaryEmail ?? (serverAccount ? 'Аккаунт ARVELIS AI' : 'Предварительный профиль')}</p>
      </div>
      {!serverAccount ? <button className="travel-secondary travel-secondary--compact" type="button" onClick={() => setEditOpen((value) => !value)} aria-expanded={editOpen} aria-controls="travel-profile-editor">Редактировать профиль</button> : null}
    </header>

    {editOpen && !serverAccount ? <form id="travel-profile-editor" className="travel-profile__editor" onSubmit={save} noValidate>
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
    </form> : null}

    <section className="travel-profile__menu" aria-label="Разделы профиля">
      <ProfileMenuRow icon="person" title="Личные данные" />
      <ProfileMenuRow icon="sliders" title="Настройки поездок" />
      <ProfileMenuRow icon="document" title="Мои документы" />
      <ProfileMenuRow icon="bell" title="Уведомления" />
      <ProfileMenuRow icon="shield" title="Безопасность" onClick={() => setSecurityOpen((value) => !value)} expanded={securityOpen} />
      <ProfileMenuRow icon="lock" title="Конфиденциальность" />
      <ProfileMenuRow icon="help" title="Помощь" />
      <ProfileMenuRow icon="info" title="О приложении" />
    </section>

    {securityOpen ? <section className="travel-profile__security" aria-label="Безопасность">
      <AccountSecurityPanel
        connected={serverAccount}
        sessions={sessions}
        sessionsStatus={sessionsStatus}
        onRefreshSessions={onRefreshSessions}
        onRevokeSession={onRevokeSession}
      />
    </section> : null}

    {signOutError ? <div className="travel-alert" role="alert">Не удалось завершить текущую сессию.</div> : null}

    <div className="travel-profile__logout">
      <button className="travel-danger" type="button" onClick={onSignOut} disabled={signOutPending}>{signOutPending ? 'Выходим…' : 'Выйти'}</button>
    </div>
  </div>;
}
