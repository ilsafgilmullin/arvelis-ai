import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from '../components/Brand';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  SendIcon,
} from '../components/Icons';
import { Topbar } from '../components/Topbar';
import {
  chatDraftKey,
  loadChatDraft,
  removeChatDraft,
  saveChatDraft,
} from '../lib/chatDraftStorage';
import type { DemoMessage, DemoThread } from '../types';

const MAX_MESSAGE_LENGTH = 6000;
const DRAFT_SAVE_DELAY = 180;

const QUICK_STARTS = [
  { label: 'Разобрать задачу', prompt: 'Помоги разобраться в задаче: ' },
  { label: 'Объяснить тему', prompt: 'Объясни понятным языком: ' },
  { label: 'Сравнить варианты', prompt: 'Помоги сравнить варианты: ' },
  { label: 'Составить план', prompt: 'Помоги составить план: ' },
] as const;

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

async function copyText(content: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    // Fall through to the DOM copy fallback below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

type CopyFeedback = {
  id: string;
  status: 'copied' | 'error';
};

export function ChatScreen({
  thread,
  onNewChat,
  onSend,
  onEditMessage,
  onRenameThread,
}: {
  thread: DemoThread | null;
  onNewChat: () => void;
  onSend: (content: string) => void;
  onEditMessage: (threadId: string, messageId: string, content: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [isAtEnd, setIsAtEnd] = useState(true);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef('');
  const draftSaveTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const pendingOwnSendRef = useRef(false);

  const title = useMemo(() => thread?.title ?? 'Новый диалог', [thread]);
  const draftKey = useMemo(() => chatDraftKey(thread?.id ?? null), [thread?.id]);

  const scheduleDraftSave = (nextMessage: string) => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = window.setTimeout(() => {
      const saved = saveChatDraft(draftKey, nextMessage);
      setDraftSaveFailed(!saved);
      draftSaveTimerRef.current = null;
    }, DRAFT_SAVE_DELAY);
  };

  const updateComposerMessage = (nextMessage: string) => {
    const limited = nextMessage.slice(0, MAX_MESSAGE_LENGTH);
    messageRef.current = limited;
    setMessage(limited);
    scheduleDraftSave(limited);
  };

  const flushDraft = () => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    setDraftSaveFailed(!saveChatDraft(draftKey, messageRef.current));
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior });
    });
  };

  useEffect(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    const restoredDraft = loadChatDraft(draftKey);
    messageRef.current = restoredDraft;
    setMessage(restoredDraft);
    setDraftSaveFailed(false);
    setEditingMessageId(null);
    setEditingMessage('');
    setRenaming(false);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      saveChatDraft(draftKey, messageRef.current);
    };
  }, [draftKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [message]);

  useEffect(() => {
    if (!thread?.messages.length) {
      setIsAtEnd(true);
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    scrollToLatest(reducedMotion ? 'auto' : 'smooth');
  }, [thread?.id]);

  useEffect(() => {
    if (!thread?.messages.length) return;
    if (!pendingOwnSendRef.current && !isAtEnd) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    scrollToLatest(reducedMotion ? 'auto' : 'smooth');
    pendingOwnSendRef.current = false;
  }, [thread?.messages.length, isAtEnd]);

  useEffect(() => {
    const end = endRef.current;
    if (!end || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsAtEnd(entry.isIntersecting);
    }, {
      root: null,
      rootMargin: '0px 0px 160px 0px',
      threshold: 0.01,
    });

    observer.observe(end);
    return () => observer.disconnect();
  }, [thread?.id]);

  useEffect(() => {
    if (!editingMessageId) return;
    window.requestAnimationFrame(() => {
      editTextareaRef.current?.focus();
      editTextareaRef.current?.setSelectionRange(editingMessage.length, editingMessage.length);
    });
  }, [editingMessageId]);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

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

  const focusComposerWith = (content: string) => {
    updateComposerMessage(content);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(content.length, content.length);
      focusComposer();
    });
  };

  const submit = () => {
    const content = message.trim();
    if (!content) return;

    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    pendingOwnSendRef.current = true;
    setDraftSaveFailed(!removeChatDraft(draftKey));
    messageRef.current = '';
    setMessage('');
    onSend(content);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isCoarsePointer()) return;
    event.preventDefault();
    submit();
  };

  const startEditing = (item: DemoMessage) => {
    if (item.role !== 'user') return;
    setEditingMessageId(item.id);
    setEditingMessage(item.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingMessage('');
  };

  const saveEditing = () => {
    if (!thread || !editingMessageId) return;
    const normalized = editingMessage.trim();
    if (!normalized) return;
    onEditMessage(thread.id, editingMessageId, normalized);
    cancelEditing();
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
      return;
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      saveEditing();
    }
  };

  const startRenaming = () => {
    if (!thread) return;
    setRenameValue(thread.title);
    setRenaming(true);
    window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  };

  const saveRename = () => {
    if (!thread) return;
    const normalized = renameValue.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    onRenameThread(thread.id, normalized);
    setRenaming(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setRenaming(false);
    }
  };

  const handleCopy = async (item: DemoMessage) => {
    const copied = await copyText(item.content);
    setCopyFeedback({ id: item.id, status: copied ? 'copied' : 'error' });

    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }

    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, 1800);
  };

  const copyLabel = (messageId: string) => {
    if (copyFeedback?.id !== messageId) return 'Копировать';
    return copyFeedback.status === 'copied' ? 'Скопировано' : 'Не удалось';
  };

  const headerActions = (
    <div className="chat-header-actions">
      {thread ? (
        <button className="chat-header-action" type="button" onClick={startRenaming} aria-label="Переименовать диалог" title="Переименовать диалог">
          <EditIcon />
        </button>
      ) : null}
      <button className="chat-header-action" type="button" onClick={onNewChat} aria-label="Новый диалог" title="Новый диалог">
        <PlusIcon />
      </button>
    </div>
  );

  return (
    <div className="chat-page chat-experience">
      <Topbar title={title} subtitle="Preview · AI пока не подключён" actions={headerActions} />

      {renaming && thread ? (
        <form className="chat-rename" onSubmit={(event) => { event.preventDefault(); saveRename(); }}>
          <label htmlFor="chat-title-input">Название диалога</label>
          <div className="chat-rename__controls">
            <input
              ref={renameInputRef}
              id="chat-title-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value.slice(0, 80))}
              onKeyDown={handleRenameKeyDown}
              maxLength={80}
              autoComplete="off"
            />
            <button className="button button--primary" type="submit" disabled={!renameValue.trim()}>Сохранить</button>
            <button className="button button--secondary" type="button" onClick={() => setRenaming(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions text">
        {thread?.messages.length ? thread.messages.map((item) => {
          if (item.role === 'system') {
            return (
              <article key={item.id} className="message message--system preview-notice">
                <span className="preview-notice__dot" aria-hidden="true" />
                <span>{item.content}</span>
              </article>
            );
          }

          if (item.role === 'user') {
            const editing = editingMessageId === item.id;
            return (
              <article key={item.id} className="message message--user">
                <div className={editing ? 'message__bubble message__bubble--editing' : 'message__bubble'}>
                  {editing ? (
                    <textarea
                      ref={editTextareaRef}
                      value={editingMessage}
                      onChange={(event) => setEditingMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      onKeyDown={handleEditKeyDown}
                      maxLength={MAX_MESSAGE_LENGTH}
                      rows={2}
                      aria-label="Редактировать сообщение"
                    />
                  ) : <p>{item.content}</p>}
                </div>
                <div className="message__footer message__footer--user">
                  <span className="message__time">{timeLabel(item.createdAt)}{item.editedAt ? ' · изменено' : ''}</span>
                  {editing ? (
                    <div className="message__edit-actions">
                      <button type="button" onClick={cancelEditing}>Отмена</button>
                      <button type="button" onClick={saveEditing} disabled={!editingMessage.trim()}>Сохранить</button>
                    </div>
                  ) : (
                    <div className="message__actions">
                      <button type="button" onClick={() => { void handleCopy(item); }} aria-label={`${copyLabel(item.id)} сообщение`}>
                        {copyFeedback?.id === item.id && copyFeedback.status === 'copied' ? <CheckIcon /> : <CopyIcon />}
                        <span>{copyLabel(item.id)}</span>
                      </button>
                      <button type="button" onClick={() => startEditing(item)} aria-label="Изменить сообщение"><EditIcon /><span>Изменить</span></button>
                    </div>
                  )}
                </div>
              </article>
            );
          }

          return (
            <article key={item.id} className="message message--assistant">
              <div className="assistant-label"><BrandMark size="compact" /><span>ARVELIS AI · {item.mock ? 'MOCK' : 'PREVIEW'}</span></div>
              <p>{item.content}</p>
              {item.mock ? <span className="mock-disclaimer">Предзаписанный демонстрационный текст — не ответ модели.</span> : null}
              <div className="message__footer">
                <span className="message__time">{timeLabel(item.createdAt)}</span>
                <div className="message__actions">
                  <button type="button" onClick={() => { void handleCopy(item); }} aria-label={`${copyLabel(item.id)} сообщение ARVELIS AI`}>
                    {copyFeedback?.id === item.id && copyFeedback.status === 'copied' ? <CheckIcon /> : <CopyIcon />}
                    <span>{copyLabel(item.id)}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        }) : (
          <section className="chat-empty">
            <BrandMark size="default" />
            <p className="section-kicker">НОВЫЙ ДИАЛОГ</p>
            <h2>Что хотите решить?</h2>
            <p>Начните своими словами или выберите заготовку. Сейчас это локальный preview: сообщение сохранится на устройстве, но запрос к AI не отправляется.</p>
            <div className="chat-quick-starts" aria-label="Быстрые заготовки">
              {QUICK_STARTS.map((item) => (
                <button key={item.label} type="button" onClick={() => focusComposerWith(item.prompt)}>{item.label}</button>
              ))}
            </div>
          </section>
        )}
        <div ref={endRef} className="chat-thread__end" aria-hidden="true" />
      </div>

      <div ref={composerRef} className="chat-composer-wrap">
        {!isAtEnd && thread?.messages.length ? (
          <button className="chat-jump-latest" type="button" onClick={() => scrollToLatest('smooth')} aria-label="Перейти к последнему сообщению">
            <ChevronDownIcon /><span>К последнему</span>
          </button>
        ) : null}
        <div className="chat-composer">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => updateComposerMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={focusComposer}
            onBlur={flushDraft}
            placeholder="Сообщение ARVELIS AI…"
            aria-label="Сообщение"
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
          />
          {message.length >= 4800 ? <span className="chat-char-count">{message.length.toLocaleString('ru-RU')} / 6 000</span> : null}
          <button className="send-button" type="button" disabled={!message.trim()} onClick={submit} aria-label="Добавить сообщение в локальный preview-диалог"><SendIcon /></button>
        </div>
        {draftSaveFailed ? (
          <p className="chat-draft-warning" role="status">Черновик не удалось сохранить на устройстве.</p>
        ) : (
          <p className="chat-composer-helper">PREVIEW · Enter — отправить на компьютере · Shift+Enter — новая строка</p>
        )}
      </div>
    </div>
  );
}
