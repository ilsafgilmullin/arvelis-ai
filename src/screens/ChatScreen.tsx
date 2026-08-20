import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../components/Brand';
import { PlusIcon, SendIcon } from '../components/Icons';
import { Topbar } from '../components/Topbar';
import type { DemoMessage, DemoThread } from '../types';

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function ChatMessage({ item }: { item: DemoMessage }) {
  if (item.role === 'system') {
    return (
      <aside className="preview-notice" role="status">
        <span className="preview-notice__dot" aria-hidden="true" />
        <span>{item.content}</span>
      </aside>
    );
  }

  if (item.role === 'assistant') {
    return (
      <article className="message message--assistant">
        <div className="assistant-label">
          <BrandMark size="compact" />
          <span>ARVELIS AI · {item.mock ? 'MOCK' : 'PREVIEW'}</span>
        </div>
        <p>{item.content}</p>
        <time className="message__time" dateTime={new Date(item.createdAt).toISOString()}>{timeLabel(item.createdAt)}</time>
        {item.mock ? <span className="mock-disclaimer">Предзаписанный пример — не ответ модели.</span> : null}
      </article>
    );
  }

  return (
    <article className="message message--user">
      <div className="message__bubble"><p>{item.content}</p></div>
      <time className="message__time" dateTime={new Date(item.createdAt).toISOString()}>{timeLabel(item.createdAt)}</time>
    </article>
  );
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
  const composerRef = useRef<HTMLDivElement>(null);
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const frame = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [thread?.id, thread?.messages.length]);

  useEffect(() => {
    const viewport = window.visualViewport;

    const keepComposerVisible = () => {
      if (document.activeElement !== textareaRef.current) return;
      window.requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
      });
    };

    viewport?.addEventListener('resize', keepComposerVisible);
    viewport?.addEventListener('scroll', keepComposerVisible);
    window.addEventListener('orientationchange', keepComposerVisible);

    return () => {
      viewport?.removeEventListener('resize', keepComposerVisible);
      viewport?.removeEventListener('scroll', keepComposerVisible);
      window.removeEventListener('orientationchange', keepComposerVisible);
    };
  }, []);

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' });
      });
    });
  };

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
    <div className="chat-page chat-experience">
      <Topbar title={title} subtitle="ARVELIS AI · локальный preview" />

      <div className="chat-thread" aria-live="polite">
        {thread?.messages.length ? thread.messages.map((item) => (
          <ChatMessage key={item.id} item={item} />
        )) : (
          <section className="chat-empty">
            <BrandMark size="default" />
            <p className="section-kicker">НОВЫЙ ДИАЛОГ</p>
            <h2>О чём хотите поговорить?</h2>
            <p>Начните с вопроса, задачи или контекста. В preview сообщение сохранится локально; AI пока не подключён.</p>
          </section>
        )}
        <div ref={endRef} className="chat-thread__end" aria-hidden="true" />
      </div>

      <div ref={composerRef} className="chat-composer-wrap">
        <div className="chat-composer">
          <button
            className="icon-button icon-button--muted chat-composer__new"
            type="button"
            onClick={onNewChat}
            disabled={!thread}
            aria-label="Начать новый диалог"
            title={thread ? 'Начать новый диалог' : 'Новый диалог уже открыт'}
          >
            <PlusIcon />
          </button>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={focusComposer}
            placeholder="Сообщение…"
            aria-label="Сообщение"
            rows={1}
            maxLength={6000}
          />
          <button
            className="send-button"
            type="button"
            disabled={!message.trim()}
            onClick={submit}
            aria-label="Добавить сообщение в локальный preview-диалог"
          >
            <SendIcon />
          </button>
        </div>
        <p>PREVIEW · AI пока не подключён · Shift+Enter — новая строка</p>
      </div>
    </div>
  );
}
