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
import type { Conversation } from '../types';

function dialogueCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;

  if (mod100 >= 11 && mod100 <= 14) return `${count} диалогов`;
  if (mod10 === 1) return `${count} диалог`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} диалога`;
  return `${count} диалогов`;
}

export function HistoryScreen({
  threads,
  onOpen,
  onDelete,
}: {
  threads: Conversation[];
  onOpen: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  const orderedThreads = useMemo(
    () => [...threads].sort((a, b) => b.updatedAt - a.updatedAt),
    [threads],
  );

  const searchIndex = useMemo(() => orderedThreads.map((thread) => ({
    thread,
    content: [
      thread.title,
      ...thread.messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content),
    ]
      .join('\n')
      .toLocaleLowerCase('ru-RU'),
  })), [orderedThreads]);

  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = useMemo(() => {
    if (!normalizedQuery) return orderedThreads;
    return searchIndex
      .filter((entry) => entry.content.includes(normalizedQuery))
      .map((entry) => entry.thread);
  }, [normalizedQuery, orderedThreads, searchIndex]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const hasQuery = Boolean(normalizedQuery);
  const summary = hasQuery
    ? `Найдено ${filtered.length} из ${threads.length}`
    : dialogueCountLabel(threads.length);

  return (
    <div className="content-page history-v3">
      <Topbar title="История" subtitle="Ваши локальные диалоги на этом устройстве" />

      <section className="history-section history-v3__section" aria-labelledby="history-list-title">
        <div className="history-v3__heading">
          <div>
            <p className="section-kicker">ЛОКАЛЬНАЯ ИСТОРИЯ</p>
            <h2 id="history-list-title">Диалоги</h2>
          </div>
          <span>PREVIEW</span>
        </div>

        <div className="search-field history-v3__search" role="search" aria-label="Поиск по истории диалогов">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, CHAT_SEARCH_MAX_CHARS))}
            placeholder="Найти диалог или сообщение"
            aria-label="Поиск по истории диалогов"
            maxLength={CHAT_SEARCH_MAX_CHARS}
            autoComplete="off"
            enterKeyHint="search"
          />
          {hasQuery ? (
            <button className="history-v3__clear" type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">×</button>
          ) : null}
        </div>

        <div className="history-v3__summary" aria-live="polite">
          <span>{summary}</span>
          <small>Данные этого устройства</small>
        </div>

        {filtered.length ? (
          <div className="history-v3__list">
            {filtered.map((thread) => {
              const conversationCount = conversationMessageCount(thread);
              return (
                <div className="history-v3__row" key={thread.id}>
                  <button className="history-v3__open" type="button" onClick={() => onOpen(thread.id)}>
                    <div className="history-v3__copy">
                      <strong>{thread.title}</strong>
                      <span>{conversationPreview(thread)}</span>
                      <small>{conversationMessageCountLabel(conversationCount)} · {conversationRelativeTime(thread.updatedAt)}</small>
                    </div>
                    <ArrowIcon />
                  </button>
                  <button
                    className="icon-button icon-button--danger history-v3__delete"
                    type="button"
                    onClick={() => setPendingDelete(thread)}
                    aria-label={`Удалить диалог «${thread.title}»`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="history-v3__empty">
            <p className="section-kicker">{hasQuery ? 'ПОИСК' : 'ИСТОРИЯ'}</p>
            <h2>{hasQuery ? 'Ничего не найдено' : 'Диалогов пока нет'}</h2>
            <p>{hasQuery ? 'Попробуйте изменить запрос или очистить поиск.' : 'Начните новый чат во вкладке «Чат» — после первого сообщения разговор появится здесь.'}</p>
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
