import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../components/Brand';
import { PlusIcon, SendIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import type { DemoThread } from '../types';

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

export function ChatScreen({
  thread,
  onNewChat,
  onSend,
}: {
  thread: DemoThread | null;
  onNewChat: () => void;
  onSend: (content: string) => void;
}) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const title = useMemo(() => thread?.title ?? 'Новый диалог', [thread]);

  useEffect(() => {
    setMessage('');
  }, [thread?.id]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [message]);

  useEffect(() => {
    if (!thread?.messages.length) return;
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, [thread?.id, thread?.messages.length]);

  const submit = () => {
    const content = message.trim();
    if (!content) return;
    onSend(content);
    setMessage('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-page">
      <Topbar title={title} subtitle="Локальный тест интерфейса. Реальный AI не подключён." />

      <div className="chat-thread" aria-live="polite">
        {thread?.messages.length ? thread.messages.map((item) => (
          <article key={item.id} className={`message message--${item.role}`}>
            {item.role === 'assistant' ? (
              <div className="assistant-label"><BrandMark size="compact" /><span>ARVELIS AI · {item.mock ? 'MOCK' : 'DEMO'}</span></div>
            ) : (
              <div className="message__meta"><span>{item.role === 'user' ? 'ВЫ' : 'СИСТЕМА'}</span><time>{timeLabel(item.createdAt)}</time></div>
            )}
            <p>{item.content}</p>
            {item.mock ? <span className="mock-disclaimer">Предзаписанный демонстрационный текст — не ответ модели.</span> : null}
          </article>
        )) : (
          <section className="chat-empty">
            <BrandMark size="default" />
            <p className="section-kicker">НОВЫЙ ДИАЛОГ</p>
            <h2>Начните с задачи.</h2>
            <p>Сообщение будет сохранено только в localStorage этого браузера. AI-запрос не выполняется.</p>
          </section>
        )}
        <div ref={endRef} className="chat-thread__end" aria-hidden="true" />
      </div>

      <div className="chat-composer-wrap">
        <div className="chat-composer">
          <button className="icon-button icon-button--muted" type="button" onClick={onNewChat} aria-label="Новый диалог"><PlusIcon /></button>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение…"
            aria-label="Сообщение"
            rows={1}
            maxLength={6000}
          />
          <button className="send-button" type="button" disabled={!message.trim()} onClick={submit} aria-label="Добавить сообщение в локальный demo-диалог"><SendIcon /></button>
        </div>
        <p>DEMO · Enter — отправить, Shift+Enter — новая строка · данные остаются на устройстве</p>
      </div>
    </div>
  );
}
