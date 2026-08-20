import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import { CHAT_SEARCH_MAX_CHARS } from '../domain/chatPolicy';
import type { DemoThread } from '../types';

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return `${days} дн назад`;
}

export function HistoryScreen({
  threads,
  onOpen,
  onDelete,
}: {
  threads: DemoThread[];
  onOpen: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<DemoThread | null>(null);

  const searchIndex = useMemo(() => threads.map((thread) => ({
    thread,
    content: [thread.title, ...thread.messages.map((message) => message.content)]
      .join('\n')
      .toLocaleLowerCase('ru-RU'),
  })), [threads]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return threads;
    return searchIndex
      .filter((entry) => entry.content.includes(normalized))
      .map((entry) => entry.thread);
  }, [query, searchIndex, threads]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const hasQuery = Boolean(query.trim());

  return (
    <div className="content-page">
      <Topbar title="История" subtitle="Локальные preview-диалоги этого браузера · серверная история не подключена" />
      <section className="history-section">
        <label className="search-field">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, CHAT_SEARCH_MAX_CHARS))}
            placeholder="Поиск по локальной истории"
            aria-label="Поиск по истории"
            maxLength={CHAT_SEARCH_MAX_CHARS}
            autoComplete="off"
          />
        </label>

        <div className="history-summary"><span>{filtered.length} из {threads.length}</span><small>LOCAL PREVIEW</small></div>

        {filtered.length ? (
          <div className="history-list history-list--large">
            {filtered.map((thread) => (
              <div className="history-row history-row--managed" key={thread.id}>
                <button className="history-row__open" type="button" onClick={() => onOpen(thread.id)}>
                  <div><strong>{thread.title}</strong><span>{thread.messages.length} сообщ. · {relativeTime(thread.updatedAt)}</span></div><ArrowIcon />
                </button>
                <button className="icon-button icon-button--danger" type="button" onClick={() => setPendingDelete(thread)} aria-label={`Удалить диалог «${thread.title}»`}><TrashIcon /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="section-kicker">{hasQuery ? 'SEARCH' : 'EMPTY'}</p>
            <h2>{hasQuery ? 'Совпадений нет' : 'История пока пуста'}</h2>
            <p>{hasQuery ? 'Измените запрос или очистите строку поиска.' : 'Создайте первый локальный диалог — он появится здесь.'}</p>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Удалить локальный диалог?"
        description={pendingDelete ? `«${pendingDelete.title}» будет удалён из текущей локальной истории. После подтверждения отменить действие нельзя.` : ''}
        confirmLabel="Удалить"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
