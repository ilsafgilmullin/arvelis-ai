import { BrandLockup } from './Brand';
import { APP_LOAD_TASKS, type AppLoadProgress } from '../lib/appPreload';

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
  statusLabel = 'Открываем ARVELIS AI',
}: {
  progress?: AppLoadProgress;
  profileName?: string;
  error?: boolean;
  onRetry?: () => void;
  statusLabel?: string;
}) {
  const name = greetingName(profileName);
  const percent = progress ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100) : null;
  const completedTasks = new Set(progress?.completedTasks ?? []);

  return (
    <main className="app-boot" aria-live="polite" aria-busy={!error && (percent ?? 0) < 100}>
      <section className="app-boot__card">
        <div className="app-boot__brand" aria-hidden="true">
          <BrandLockup />
        </div>
        <div className="app-boot__copy">
          <p className="section-kicker">ARVELIS AI</p>
          <h1>{error ? 'Не удалось подготовить ARVELIS AI' : name ? `Рады видеть вас, ${name}.` : 'Добро пожаловать в ARVELIS AI.'}</h1>
          <p>
            {error
              ? 'Один из обязательных модулей не загрузился. Проверьте соединение и повторите — локальные preview-данные при этом не удаляются.'
              : 'Готовим основной интерфейс, диалог и ваши локальные данные. Остальные разделы спокойно подгрузятся после входа.'}
          </p>
        </div>

        {error ? (
          <button className="button button--primary app-boot__retry" type="button" onClick={onRetry}>
            Повторить
          </button>
        ) : progress && percent !== null ? (
          <>
            <div className="app-boot__progress" role="status" aria-label={`Подготовка ARVELIS AI: ${percent}%`}>
              <div className="app-boot__track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
              <div className="app-boot__status"><span>{progress.label}</span><strong>{percent}%</strong></div>
            </div>
            <div className="app-boot__tasks" role="list" aria-label="Этапы подготовки ARVELIS AI">
              {APP_LOAD_TASKS.map((task) => {
                const done = completedTasks.has(task.id);
                return (
                  <div className={`app-boot__task${done ? ' app-boot__task--done' : ''}`} role="listitem" key={task.id}>
                    <span className="app-boot__task-dot" aria-hidden="true">{done ? '✓' : ''}</span>
                    <span>{task.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="app-boot__progress app-boot__progress--indeterminate" role="status">
            <div className="app-boot__track" aria-hidden="true"><span /></div>
            <div className="app-boot__status"><span>{statusLabel}</span></div>
          </div>
        )}
      </section>
    </main>
  );
}
