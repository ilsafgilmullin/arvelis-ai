import { type FormEvent, useState } from 'react';
import {
  PREVIEW_PROFILE_NAME_MAX_LENGTH,
  isDefaultPreviewProfileName,
  normalizePreviewProfileName,
  resolveStoredPreviewProfileName,
  validatePreviewProfileName,
} from '../auth/previewProfile';
import { BrandLockup } from '../components/Brand';

export function AuthScreen({
  initialName,
  onContinue,
}: {
  initialName: string;
  onContinue: (name: string) => void;
}) {
  const initialProfileName = resolveStoredPreviewProfileName(initialName);
  const hasLocalProfile = !isDefaultPreviewProfileName(initialProfileName);
  const [name, setName] = useState(hasLocalProfile ? initialProfileName : '');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const continuePreview = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const candidate = hasLocalProfile ? initialProfileName : name;
    const error = validatePreviewProfileName(candidate);
    if (error) {
      setValidationMessage(error);
      return;
    }
    onContinue(normalizePreviewProfileName(candidate));
  };

  return (
    <main className="auth-shell auth-shell--v2 travel-auth" data-auth-mode="preview">
      <section className="auth-panel auth-panel--v2">
        <header className="auth-brand">
          <BrandLockup compact variant="travel" />
          <span className="auth-preview-badge">Предварительная версия</span>
        </header>

        <div className="auth-heading auth-heading--v2">
          <p className="section-kicker">ARVELIS AI · TRAVEL ASSISTANT</p>
          <h1>Планируйте поездки в одном месте</h1>
          <p>Собирайте маршрут, бюджет, документы и детали поездки в едином Travel workspace.</p>
        </div>

        {hasLocalProfile ? (
          <section className="auth-local-profile" aria-label="Профиль предварительной версии">
            <div className="auth-local-profile__avatar" aria-hidden="true">
              {initialProfileName.slice(0, 1).toLocaleUpperCase('ru-RU') || 'A'}
            </div>
            <div className="auth-local-profile__copy">
              <span>Продолжить как</span>
              <strong>{initialProfileName}</strong>
            </div>
            <button className="button button--primary auth-submit" type="button" aria-label="Продолжить в режиме предварительного просмотра" onClick={() => continuePreview()}>
              Продолжить
            </button>
          </section>
        ) : (
          <form className="auth-form auth-form--v2" onSubmit={continuePreview} noValidate>
            <label htmlFor="preview-profile-name">
              Как к вам обращаться
              <input
                id="preview-profile-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (validationMessage) setValidationMessage(null);
                }}
                placeholder="Например: Ильсаф"
                maxLength={PREVIEW_PROFILE_NAME_MAX_LENGTH}
                autoComplete="nickname"
                autoCapitalize="words"
                enterKeyHint="go"
                aria-invalid={Boolean(validationMessage)}
                aria-describedby={validationMessage ? 'preview-profile-name-error' : undefined}
              />
            </label>
            {validationMessage ? (
              <p className="auth-field-error" id="preview-profile-name-error" role="alert">{validationMessage}</p>
            ) : null}
            <button className="button button--primary auth-submit" type="submit" aria-label="Продолжить в режиме предварительного просмотра">
              Продолжить
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
