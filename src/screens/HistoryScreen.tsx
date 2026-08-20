import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import { CHAT_SEARCH_MAX_CHARS } from '../domain/chatPolicy';
import {
  conversationMessageCount,
  conversationMessageCountLabel,
  conversationPreview,
  conversationRelativeTime,
} from '../domain/chatPresentation';
import type { DemoThread } from '../types';

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
                      <span className="history-v2__preview">{conversationPreview(thread)}</span>
                      <small>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</small>
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
