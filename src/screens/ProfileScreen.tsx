import { FormEvent, useState } from 'react';
import { AccountSecurityPanel } from '../auth/AccountSecurityPanel';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  normalizePreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ResetIcon, SignOutIcon, StateIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';

export function ProfileScreen({
  profileName,
  persistenceAvailable,
  onSaveName,
  onOpenStates,
  onSignOut,
  onReset,
}: {
  profileName: string;
  persistenceAvailable: boolean;
  onSaveName: (name: string) => void;
  onOpenStates: () => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(profileName);
  const [saved, setSaved] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const normalizedName = normalizePreviewProfileName(name);
  const rawChanged = name !== profileName;
  const normalizedChanged = normalizedName !== profileName;
  const profileInitial = profileName.slice(0, 1).toLocaleUpperCase('ru-RU') || 'A';

  const save = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const error = validatePreviewProfileName(name);
    if (error) {
      setValidationMessage(error);
      setSaved(false);
      return;
    }

    setName(normalizedName);
    setValidationMessage(null);

    if (!normalizedChanged) {
      setSaved(false);
      return;
    }

    onSaveName(normalizedName);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  };

  const reset = () => {
    setConfirmReset(false);
    onReset();
  };

  return (
    <div className="content-page profile-v2">
      <Topbar title="Профиль" subtitle="Аккаунт, безопасность и данные" />

      <section className="profile-v2__identity" aria-labelledby="profile-identity-title">
        <div className="profile-v2__avatar" aria-hidden="true">{profileInitial}</div>
        <div className="profile-v2__identity-copy">
          <div className="profile-v2__identity-meta">
            <p className="section-kicker">ВАШ ПРОФИЛЬ</p>
            <span>LOCAL PREVIEW</span>
          </div>
          <h2 id="profile-identity-title">{profileName}</h2>
          <p>Сейчас этот профиль существует только на текущем устройстве. Защищённая серверная учётная запись будет подключена отдельным этапом.</p>
        </div>
      </section>

      <section className="profile-v2__section" aria-labelledby="profile-name-title">
        <div className="profile-v2__section-heading">
          <p className="section-kicker">ЛИЧНЫЕ ДАННЫЕ</p>
          <h2 id="profile-name-title">Отображаемое имя</h2>
          <p>Используется только в пользовательском интерфейсе ARVELIS AI.</p>
        </div>

        <form className="profile-v2__name-form" onSubmit={save} noValidate>
          <label htmlFor="profile-display-name">Имя</label>
          <div className="profile-v2__name-row">
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
              aria-describedby={validationMessage ? 'profile-name-error' : 'profile-name-hint'}
            />
            <button className="button button--secondary" type="submit" disabled={!rawChanged && !validationMessage}>
              {saved ? 'Сохранено' : 'Сохранить'}
            </button>
          </div>
          {validationMessage ? (
            <p className="auth-field-error" id="profile-name-error" role="alert">{validationMessage}</p>
          ) : (
            <p className="profile-v2__field-hint" id="profile-name-hint">До {PREVIEW_PROFILE_NAME_MAX_LENGTH} символов. Пароль и другие секреты здесь не используются.</p>
          )}
        </form>
      </section>

      <section className="profile-v2__section" aria-labelledby="profile-security-title">
        <div className="profile-v2__section-heading profile-v2__section-heading--compact">
          <p className="section-kicker">БЕЗОПАСНОСТЬ</p>
          <h2 id="profile-security-title">Аккаунт и сессии</h2>
          <p>Серверные устройства и сессии появятся только после подключения настоящей авторизации.</p>
        </div>
        <AccountSecurityPanel connected={false} />
      </section>

      <section className="profile-v2__section" aria-labelledby="profile-data-title">
        <div className="profile-v2__section-heading">
          <p className="section-kicker">ДАННЫЕ И КОНФИДЕНЦИАЛЬНОСТЬ</p>
          <h2 id="profile-data-title">Где находятся данные сейчас</h2>
          <p>Текущий preview не использует production-базу или облачную синхронизацию.</p>
        </div>

        <div className="profile-v2__data-list">
          <div className="profile-v2__data-row">
            <div>
              <strong>Локальное сохранение</strong>
              <span>{persistenceAvailable ? 'Диалоги и имя сохраняются в браузере этого устройства.' : 'Браузер не подтверждает сохранение. Изменения могут исчезнуть после перезагрузки.'}</span>
            </div>
            <span className={persistenceAvailable ? 'profile-v2__state profile-v2__state--ok' : 'profile-v2__state profile-v2__state--warning'}>
              {persistenceAvailable ? 'ДОСТУПНО' : 'НЕДОСТУПНО'}
            </span>
          </div>
          <div className="profile-v2__data-row">
            <div>
              <strong>Серверное хранение</strong>
              <span>Production database и синхронизация между устройствами ещё не подключены.</span>
            </div>
            <span className="profile-v2__state">НЕ ПОДКЛЮЧЕНО</span>
          </div>
          <div className="profile-v2__data-row">
            <div>
              <strong>Экспорт и удаление аккаунта</strong>
              <span>Полный lifecycle данных будет реализован вместе с настоящим серверным аккаунтом и privacy policy.</span>
            </div>
            <span className="profile-v2__state">ПОСЛЕ BACKEND</span>
          </div>
        </div>
      </section>

      <section className="profile-v2__section profile-v2__section--actions" aria-labelledby="profile-actions-title">
        <div className="profile-v2__section-heading">
          <p className="section-kicker">УПРАВЛЕНИЕ</p>
          <h2 id="profile-actions-title">Действия профиля</h2>
        </div>

        <div className="profile-v2__actions">
          <button className="profile-v2__action" type="button" onClick={onSignOut}>
            <SignOutIcon />
            <div><strong>Выйти из preview-профиля</strong><span>Вернёт на экран входа. Локальные диалоги останутся на этом устройстве.</span></div>
            <span>Выйти</span>
          </button>

          <button className="profile-v2__action profile-v2__action--internal" type="button" onClick={onOpenStates}>
            <StateIcon />
            <div><strong>Диагностика preview</strong><span>Внутренний экран для проверки loading, error, offline и auth/security states.</span></div>
            <span>PREVIEW</span>
          </button>

          <button className="profile-v2__action profile-v2__action--danger" type="button" onClick={() => setConfirmReset(true)}>
            <ResetIcon />
            <div><strong>Сбросить локальные данные</strong><span>Удалит локальные диалоги и профиль, восстановит стартовые примеры и вернёт на регистрацию.</span></div>
            <span>Сбросить</span>
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Сбросить локальные данные?"
        description="Локальные диалоги, имя и настройки этого preview-профиля будут удалены. Стартовые примеры восстановятся, после чего ARVELIS AI вернётся на экран регистрации."
        confirmLabel="Сбросить данные"
        danger
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
