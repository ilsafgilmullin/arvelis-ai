import { useState } from 'react';
import { ArrowIcon, SendIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import { starterPrompts } from '../data/demo';
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

function dialogCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} диалог`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} диалога`;
  return `${count} диалогов`;
}

export function WorkspaceScreen({
  profileName,
  threads,
  onSubmit,
  onOpenThread,
}: {
  profileName: string;
  threads: DemoThread[];
  onSubmit: (prompt: string) => void;
  onOpenThread: (threadId: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt) return;
    onSubmit(prompt);
    setDraft('');
  };

  return (
    <div className="content-page">
      <Topbar title="Рабочее пространство" subtitle={`${profileName} · frontend preview`} />

      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <p className="section-kicker">ARVELIS WORKSPACE</p>
          <h2>Сформулируйте задачу.</h2>
          <p>Укажите цель, контекст, ограничения и критерий результата. В preview запрос создаёт локальный тестовый диалог без обращения к AI.</p>
        </div>
        <div className="composer composer--hero">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Например: сравнить решения, разобрать документ или построить план действий…"
            aria-label="Описание задачи"
            rows={5}
            maxLength={6000}
          />
          <div className="composer__footer">
            <span>{draft.length.toLocaleString('ru-RU')} / 6 000 · LOCAL PREVIEW</span>
            <button className="send-button" type="button" disabled={!draft.trim()} onClick={submit} aria-label="Создать локальный preview-диалог"><SendIcon /></button>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading"><p className="section-kicker">БЫСТРЫЙ СТАРТ</p><h2>Типовые сценарии</h2></div>
        <div className="scenario-list">
          {starterPrompts.map((item) => (
            <button className="scenario-row" type="button" key={item.id} onClick={() => onSubmit(item.prompt)}>
              <span className="scenario-row__index">{item.index}</span>
              <div><strong>{item.title}</strong><p>{item.description}</p></div>
              <ArrowIcon />
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading section-heading--inline"><div><p className="section-kicker">ИСТОРИЯ</p><h2>Последние диалоги</h2></div><span>{dialogCount(threads.length)}</span></div>
        {threads.length ? (
          <div className="history-list">
            {threads.slice(0, 4).map((thread) => (
              <button className="history-row" type="button" key={thread.id} onClick={() => onOpenThread(thread.id)}>
                <div><strong>{thread.title}</strong><span>{thread.messages.length} сообщ. · {relativeTime(thread.updatedAt)}</span></div>
                <ArrowIcon />
              </button>
            ))}
          </div>
        ) : <div className="empty-inline">История пока пуста. Создайте первый локальный диалог.</div>}
      </section>
    </div>
  );
}
