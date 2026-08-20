import { useMemo, useState } from 'react';
import { ArrowIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
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
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return threads;
    return threads.filter((thread) => thread.title.toLocaleLowerCase('ru-RU').includes(normalized) || thread.messages.some((message) => message.content.toLocaleLowerCase('ru-RU').includes(normalized)));
  }, [query, threads]);

  return (
    <div className="content-page">
      <Topbar title="История" subtitle="Локальные demo-диалоги этого браузера." />
      <section className="history-section">
        <label className="search-field">
          <SearchIcon />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по локальной истории" aria-label="Поиск по истории" />
        </label>

        <div className="history-summary"><span>{filtered.length} из {threads.length}</span><small>LOCAL STORAGE</small></div>

        {filtered.length ? (
          <div className="history-list history-list--large">
            {filtered.map((thread) => (
              <div className="history-row history-row--managed" key={thread.id}>
                <button className="history-row__open" type="button" onClick={() => onOpen(thread.id)}>
                  <div><strong>{thread.title}</strong><span>{thread.messages.length} сообщений</span></div><ArrowIcon />
                </button>
                <button className="icon-button icon-button--danger" type="button" onClick={() => onDelete(thread.id)} aria-label={`Удалить диалог «${thread.title}»`}><TrashIcon /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state"><p className="section-kicker">EMPTY</p><h2>Ничего не найдено</h2><p>Измените запрос или создайте новый локальный диалог.</p></div>
        )}
      </section>
    </div>
  );
}
