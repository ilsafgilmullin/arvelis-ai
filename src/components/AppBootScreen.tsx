import { BrandLockup } from './Brand';
import type { AppLoadProgress } from '../lib/appPreload';

function greetingName(profileName?: string): string | null {
  const normalized = profileName?.trim();
  if (!normalized || normalized === 'Пользователь ARVELIS') return null;
  return normalized.split(/\s+/)[0] ?? null;
}

export function AppBootScreen({
  progress,
  profileName,
  error,
  onRetry,
}: {
  progress: AppLoadProgress;
  profileName?: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  const name = greetingName(profileName);
  const percent = Math.round((progress.completed / Math.max(progress.total, 1)) * 100);

  return (
    <main className="app-boot" aria-live="polite" aria-busy={!error}>
      <section className="app-boot__card">
        <div className="app-boot__brand" aria-hidden="true">
          <BrandLockup />
        </div>
        <div className="app-boot__copy">
          <p className="section-kicker">ARVELIS AI</p>
          <h1>{error ? 'Не удалось подготовить интерфейс' : name ? `Рады видеть вас, ${name}.` : 'Добро пожаловать в ARVELIS AI.'}</h1>
          <p>
            {error
              ? 'Критический модуль не загрузился. Можно безопасно повторить подготовку интерфейса.'
              : 'Подготавливаем только то, что нужно для быстрого старта. Остальные разделы прогреются в фоне после входа.'}
          </p>
        </div>

        {error ? (
          <button className="button button--primary app-boot__retry" type="button" onClick={onRetry}>
            Повторить
          </button>
        ) : (
          <div className="app-boot__progress" role="status" aria-label={`Подготовка ARVELIS AI: ${percent}%`}>
            <div className="app-boot__track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
            <div className="app-boot__status"><span>{progress.label}</span><strong>{percent}%</strong></div>
          </div>
        )}
      </section>
    </main>
  );
}
