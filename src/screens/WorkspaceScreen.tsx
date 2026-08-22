import { isDefaultPreviewProfileName, normalizePreviewProfileName } from '../auth/previewProfile';
import { ArrowIcon, ChatIcon, HistoryIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import {
  conversationMessageCount,
  conversationMessageCountLabel,
  conversationRelativeTime,
} from '../domain/chatPresentation';
import type { DemoThread } from '../types';

function greetingFor(profileName: string): string {
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const normalized = normalizePreviewProfileName(profileName);
  if (!normalized || isDefaultPreviewProfileName(normalized)) return greeting;
  const firstName = normalized.split(/\s+/)[0] ?? normalized;
  return `${greeting}, ${firstName}`;
}

export function WorkspaceScreen({
  profileName,
  threads,
  threadLimitReached,
  onNewChat,
  onOpenThread,
  onOpenHistory,
}: {
  profileName: string;
  threads: DemoThread[];
  threadLimitReached: boolean;
  onNewChat: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenHistory: () => void;
}) {
  const recentThreads = [...threads]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 3);
  const latestThread = recentThreads[0] ?? null;

  return (
    <div className="content-page home-v4">
      <Topbar title="Главная" subtitle={`${greetingFor(profileName)}.`} demo={false} />

      <section className="home-v4__hero" aria-labelledby="home-primary-title">
        <div className="home-v4__hero-copy">
          <p className="section-kicker">РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h2 id="home-primary-title">С чего начнём?</h2>
          <p>Начните новый диалог или продолжите работу с последнего места.</p>
        </div>

        <div className="home-v4__actions" aria-label="Основные действия">
          <button
            className="button button--primary home-v4__new-chat"
            type="button"
            onClick={onNewChat}
            disabled={threadLimitReached}
          >
            <ChatIcon />
            <span>Новый диалог</span>
          </button>

          {latestThread ? (
            <button
              className="home-v4__continue"
              type="button"
              onClick={() => onOpenThread(latestThread.id)}
            >
              <span className="home-v4__continue-label">ПРОДОЛЖИТЬ</span>
              <span className="home-v4__continue-title">{latestThread.title}</span>
              <span className="home-v4__continue-meta">
                {conversationMessageCountLabel(conversationMessageCount(latestThread))} · {conversationRelativeTime(latestThread.updatedAt)}
              </span>
              <ArrowIcon />
            </button>
          ) : null}
        </div>

        {threadLimitReached ? (
          <p className="home-v4__limit" role="status">
            Достигнут лимит сохранённых диалогов. Удалите ненужный диалог в Истории, чтобы начать новый.
          </p>
        ) : null}
      </section>

      <section className="home-v4__recent" aria-labelledby="home-recent-title">
        <div className="home-v4__section-heading">
          <div>
            <p className="section-kicker">НЕДАВНЕЕ</p>
            <h2 id="home-recent-title">Последние диалоги</h2>
          </div>
          {threads.length ? (
            <button className="home-v4__history-link" type="button" onClick={onOpenHistory}>
              <HistoryIcon />
              <span>Вся история</span>
            </button>
          ) : null}
        </div>

        {recentThreads.length ? (
          <div className="home-v4__recent-list">
            {recentThreads.map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <button className="home-v4__recent-row" type="button" key={thread.id} onClick={() => onOpenThread(thread.id)}>
                  <div>
                    <strong>{thread.title}</strong>
                    <span>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</span>
                  </div>
                  <ArrowIcon />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="home-v4__empty">
            <div className="home-v4__empty-mark" aria-hidden="true"><ChatIcon /></div>
            <div>
              <strong>История пока пуста</strong>
              <p>Созданные вами диалоги будут появляться здесь автоматически.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
