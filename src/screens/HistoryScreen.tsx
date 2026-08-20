import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import { CHAT_SEARCH_MAX_CHARS } from '../domain/chatPolicy';
import type { DemoThread } from '../types';

function relativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return 'только что';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

function conversationMessageCount(thread: DemoThread): number {
  return thread.messages.reduce((count, message) => count + (message.role === 'system' ? 0 : 1), 0);
}

function messageCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} сообщений`;
  if (mod10 === 1) return `${count} сообщение`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} сообщения`;
  return `${count} сообщений`;
}

function threadPreview(thread: DemoThread): string {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (!message || message.role === 'system') continue;
    const normalized = message.content.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;
    return normalized.length > 92 ? `${normalized.slice(0, 91)}…` : normalized;
  }
  return 'Диалог без содержимого';
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
    content: [
      thread.title,
      ...thread.messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content),
    ]
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
    <div className="content-page history-v2">
      <Topbar title="История" subtitle="Ваши локальные диалоги на этом устройстве" />
      <section className="history-section history-v2__section">
        <div className="search-field history-v2__search" role="search" aria-label="Поиск по истории диалогов">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, CHAT_SEARCH_MAX_CHARS))}
            placeholder="Найти диалог или сообщение"
            aria-label="Поиск по истории диалогов"
            maxLength={CHAT_SEARCH_MAX_CHARS}
            autoComplete="off"
          />
          {hasQuery ? (
            <button className="history-v2__clear" type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">×</button>
          ) : null}
        </div>

        <div className="history-summary history-v2__summary">
          <span>Диалогов: {filtered.length}{hasQuery ? ` из ${threads.length}` : ''}</span>
          <small>ЛОКАЛЬНО</small>
        </div>

        {filtered.length ? (
          <div className="history-list history-list--large history-v2__list">
            {filtered.map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <div className="history-row history-row--managed history-v2__row" key={thread.id}>
                  <button className="history-row__open history-v2__open" type="button" onClick={() => onOpen(thread.id)}>
                    <div className="history-v2__copy">
                      <strong>{thread.title}</strong>
                      <span className="history-v2__preview">{threadPreview(thread)}</span>
                      <small>{messageCountLabel(conversationCount)} · {relativeTime(thread.updatedAt)}</small>
                    </div>
                    <ArrowIcon />
                  </button>
                  <button className="icon-button icon-button--danger history-v2__delete" type="button" onClick={() => setPendingDelete(thread)} aria-label={`Удалить диалог «${thread.title}»`}><TrashIcon /></button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state history-v2__empty">
            <p className="section-kicker">{hasQuery ? 'ПОИСК' : 'ИСТОРИЯ'}</p>
            <h2>{hasQuery ? 'Ничего не найдено' : 'Диалогов пока нет'}</h2>
            <p>{hasQuery ? 'Попробуйте изменить запрос или очистить поиск.' : 'Начните новый диалог — после первого сообщения он появится здесь.'}</p>
            {hasQuery ? <button className="button button--secondary" type="button" onClick={() => setQuery('')}>Очистить поиск</button> : null}
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
