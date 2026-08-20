import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { BrandMark } from '../components/Brand';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  TrashIcon,
} from '../components/Icons';
import { Topbar } from '../components/Topbar';
import {
  CHAT_COMPOSER_COUNTER_THRESHOLD,
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_SEARCH_MAX_CHARS,
  CHAT_THREAD_TITLE_MAX_CHARS,
} from '../domain/chatPolicy';
import { useChatDraft } from '../hooks/useChatDraft';
import { chatDraftKey } from '../lib/chatDraftStorage';
import type { DemoMessage, DemoThread } from '../types';

const QUICK_STARTS = [
  { label: 'Разобрать задачу', prompt: 'Помоги разобраться в задаче: ' },
  { label: 'Объяснить тему', prompt: 'Объясни понятным языком: ' },
  { label: 'Сравнить варианты', prompt: 'Помоги сравнить варианты: ' },
  { label: 'Составить план', prompt: 'Помоги составить план: ' },
] as const;

function timeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey(timestamp) === dayKey(today.getTime())) return 'Сегодня';
  if (dayKey(timestamp) === dayKey(yesterday.getTime())) return 'Вчера';

  return new Intl.DateTimeFormat('ru-RU', date.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
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
  threadLimitReached,
  messageLimitReached,
  onNewChat,
  onSend,
  onEditMessage,
  onRenameThread,
  onDeleteThread,
}: {
  thread: DemoThread | null;
  threadLimitReached: boolean;
  messageLimitReached: boolean;
  onNewChat: () => void;
  onSend: (content: string) => void;
  onEditMessage: (threadId: string, messageId: string, content: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string) => void;
}) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [isAtEnd, setIsAtEnd] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const pendingOwnSendRef = useRef(false);
  const isAtEndRef = useRef(true);

  const title = useMemo(() => thread?.title ?? 'Новый диалог', [thread]);
  const draftKey = useMemo(() => chatDraftKey(thread?.id ?? null), [thread?.id]);
  const {
    value: message,
    setValue: updateComposerMessage,
    saveFailed: draftSaveFailed,
    flush: flushDraft,
    clear: clearDraft,
  } = useChatDraft(draftKey);
  const sendLimitReached = thread ? messageLimitReached : threadLimitReached;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('ru-RU');
  const searchMatches = useMemo(() => {
    if (!thread || !normalizedSearchQuery) return [];
    return thread.messages
      .filter((item) => item.content.toLocaleLowerCase('ru-RU').includes(normalizedSearchQuery))
      .map((item) => item.id);
  }, [thread, normalizedSearchQuery]);
  const activeSearchMessageId = searchMatches.length
    ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)] ?? null
    : null;

  const setEndState = (next: boolean) => {
    isAtEndRef.current = next;
    setIsAtEnd((current) => current === next ? current : next);
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior });
    });
  };

  const scrollToMessage = (messageId: string) => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.requestAnimationFrame(() => {
      messageNodesRef.current.get(messageId)?.scrollIntoView({
        block: 'center',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    });
  };

  useEffect(() => {
    setEditingMessageId(null);
    setEditingMessage('');
    setRenaming(false);
    setDeleteOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
    messageNodesRef.current.clear();
    pendingOwnSendRef.current = false;
    setEndState(true);
  }, [draftKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [message]);

  useEffect(() => {
    if (!thread?.messages.length) {
      setEndState(true);
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    scrollToLatest(reducedMotion ? 'auto' : 'smooth');
  }, [thread?.id]);

  useEffect(() => {
    if (!thread?.messages.length) return;
    if (!pendingOwnSendRef.current && !isAtEndRef.current) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    scrollToLatest(reducedMotion ? 'auto' : 'smooth');
    pendingOwnSendRef.current = false;
  }, [thread?.id, thread?.messages.length]);

  useEffect(() => {
    const end = endRef.current;
    if (!end || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setEndState(entry.isIntersecting);
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
    if (!searchOpen || !activeSearchMessageId) return;
    scrollToMessage(activeSearchMessageId);
  }, [searchOpen, activeSearchMessageId]);

  useEffect(() => {
    if (searchIndex < searchMatches.length || searchIndex === 0) return;
    setSearchIndex(0);
  }, [searchIndex, searchMatches.length]);

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
    if (sendLimitReached) return;
    updateComposerMessage(content);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(content.length, content.length);
      focusComposer();
    });
  };

  const submit = () => {
    const content = message.trim();
    if (!content || sendLimitReached) return;

    pendingOwnSendRef.current = true;
    clearDraft();
    onSend(content);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isCoarsePointer()) return;
    event.preventDefault();
    submit();
  };

  const startEditing = (item: DemoMessage) => {
    if (item.role !== 'user') return;
    closeSearch();
    setRenaming(false);
    setEditingMessageId(item.id);
    setEditingMessage(item.content.slice(0, CHAT_MESSAGE_MAX_CHARS));
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

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
  };

  const startRenaming = () => {
    if (!thread) return;
    closeSearch();
    cancelEditing();
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

  const openSearch = () => {
    if (!thread) return;
    setRenaming(false);
    cancelEditing();
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const moveSearch = (direction: 1 | -1) => {
    if (!searchMatches.length) return;
    const nextIndex = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    setSearchIndex(nextIndex);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === 'Enter' && searchMatches.length) {
      event.preventDefault();
      moveSearch(event.shiftKey ? -1 : 1);
    }
  };

  const openDelete = () => {
    closeSearch();
    setRenaming(false);
    cancelEditing();
    setDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!thread) return;
    clearDraft();
    onDeleteThread(thread.id);
    setDeleteOpen(false);
  };

  const headerActions = thread ? (
    <div className="chat-header-actions">
      <button
        className={searchOpen ? 'chat-header-action chat-header-action--active' : 'chat-header-action'}
        type="button"
        onClick={searchOpen ? closeSearch : openSearch}
        aria-label={searchOpen ? 'Закрыть поиск по диалогу' : 'Поиск по диалогу'}
        title={searchOpen ? 'Закрыть поиск' : 'Поиск по диалогу'}
      >
        <SearchIcon />
      </button>
      <button className="chat-header-action" type="button" onClick={startRenaming} aria-label="Переименовать диалог" title="Переименовать диалог">
        <EditIcon />
      </button>
      <button className="chat-header-action chat-header-action--danger" type="button" onClick={openDelete} aria-label="Удалить диалог" title="Удалить диалог">
        <TrashIcon />
      </button>
      <button className="chat-header-action" type="button" onClick={onNewChat} aria-label="Новый диалог" title="Новый диалог">
        <PlusIcon />
      </button>
    </div>
  ) : null;

  return (
    <div className="chat-page chat-experience">
      <Topbar title={title} subtitle="Preview · AI пока не подключён" actions={headerActions} />

      {searchOpen && thread ? (
        <section className="chat-search" role="search" aria-label="Поиск по текущему диалогу">
          <SearchIcon />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value.slice(0, CHAT_SEARCH_MAX_CHARS));
              setSearchIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Найти в диалоге"
            aria-label="Найти сообщение в диалоге"
            maxLength={CHAT_SEARCH_MAX_CHARS}
            autoComplete="off"
          />
          <span className="chat-search__count" aria-live="polite">
            {normalizedSearchQuery ? (searchMatches.length ? `${Math.min(searchIndex + 1, searchMatches.length)} / ${searchMatches.length}` : '0 / 0') : '—'}
          </span>
          <div className="chat-search__actions">
            <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(-1)}>Назад</button>
            <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(1)}>Далее</button>
            <button type="button" onClick={closeSearch}>Закрыть</button>
          </div>
        </section>
      ) : null}

      {renaming && thread ? (
        <form className="chat-rename" onSubmit={(event) => { event.preventDefault(); saveRename(); }}>
          <label htmlFor="chat-title-input">Название диалога</label>
          <div className="chat-rename__controls">
            <input
              ref={renameInputRef}
              id="chat-title-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value.slice(0, CHAT_THREAD_TITLE_MAX_CHARS))}
              onKeyDown={handleRenameKeyDown}
              maxLength={CHAT_THREAD_TITLE_MAX_CHARS}
              autoComplete="off"
            />
            <button className="button button--primary" type="submit" disabled={!renameValue.trim()}>Сохранить</button>
            <button className="button button--secondary" type="button" onClick={() => setRenaming(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions text">
        {thread?.messages.length ? thread.messages.map((item, index) => {
          const previous = index > 0 ? thread.messages[index - 1] : undefined;
          const showDate = !previous || dayKey(previous.createdAt) !== dayKey(item.createdAt);
          const searchHit = item.id === activeSearchMessageId;
          const registerNode = (node: HTMLElement | null) => {
            if (node) messageNodesRef.current.set(item.id, node);
            else messageNodesRef.current.delete(item.id);
          };

          let content: ReactNode;
          if (item.role === 'system') {
            content = (
              <article ref={registerNode} className={searchHit ? 'message message--system preview-notice message--search-hit' : 'message message--system preview-notice'}>
                <span className="preview-notice__dot" aria-hidden="true" />
                <span>{item.content}</span>
              </article>
            );
          } else if (item.role === 'user') {
            const editing = editingMessageId === item.id;
            content = (
              <article ref={registerNode} className={searchHit ? 'message message--user message--search-hit' : 'message message--user'}>
                <div className={editing ? 'message__bubble message__bubble--editing' : 'message__bubble'}>
                  {editing ? (
                    <textarea
                      ref={editTextareaRef}
                      value={editingMessage}
                      onChange={(event) => setEditingMessage(event.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS))}
                      onKeyDown={handleEditKeyDown}
                      maxLength={CHAT_MESSAGE_MAX_CHARS}
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
          } else {
            content = (
              <article ref={registerNode} className={searchHit ? 'message message--assistant message--search-hit' : 'message message--assistant'}>
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
          }

          return (
            <Fragment key={item.id}>
              {showDate ? <div className="chat-date-separator"><span>{dateLabel(item.createdAt)}</span></div> : null}
              {content}
            </Fragment>
          );
        }) : (
          <section className="chat-empty">
            <BrandMark size="default" />
            <p className="section-kicker">НОВЫЙ ДИАЛОГ</p>
            <h2>{threadLimitReached ? 'Освободите место для нового диалога' : 'Что хотите решить?'}</h2>
            <p>{threadLimitReached ? 'Локальный preview достиг лимита диалогов. Удалите ненужный диалог в «Истории», затем вернитесь сюда.' : 'Начните своими словами или выберите заготовку. Сейчас это локальный preview: сообщение сохранится на устройстве, но запрос к AI не отправляется.'}</p>
            {!threadLimitReached ? (
              <div className="chat-quick-starts" aria-label="Быстрые заготовки">
                {QUICK_STARTS.map((item) => (
                  <button key={item.label} type="button" onClick={() => focusComposerWith(item.prompt)}>{item.label}</button>
                ))}
              </div>
            ) : null}
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
        {messageLimitReached && thread ? (
          <div className="chat-limit-notice" role="status">
            <strong>Локальный лимит диалога достигнут.</strong>
            <span>Начните новый диалог, чтобы продолжить.</span>
            <button type="button" onClick={onNewChat}>Новый диалог</button>
          </div>
        ) : null}
        <div className="chat-composer">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => updateComposerMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={focusComposer}
            onBlur={flushDraft}
            placeholder={sendLimitReached ? 'Отправка временно недоступна' : 'Сообщение ARVELIS AI…'}
            aria-label="Сообщение"
            rows={1}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            disabled={sendLimitReached}
          />
          {message.length >= CHAT_COMPOSER_COUNTER_THRESHOLD ? <span className="chat-char-count">{message.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span> : null}
          <button className="send-button" type="button" disabled={!message.trim() || sendLimitReached} onClick={submit} aria-label="Добавить сообщение в локальный preview-диалог"><SendIcon /></button>
        </div>
        {draftSaveFailed ? (
          <p className="chat-draft-warning" role="status">Черновик не удалось сохранить на устройстве.</p>
        ) : (
          <p className="chat-composer-helper">PREVIEW · Enter — отправить на компьютере · Shift+Enter — новая строка</p>
        )}
      </div>

      <span className="chat-a11y-status" aria-live="polite">
        {copyFeedback ? (copyFeedback.status === 'copied' ? 'Сообщение скопировано' : 'Не удалось скопировать сообщение') : ''}
      </span>

      <ConfirmDialog
        open={deleteOpen}
        title="Удалить локальный диалог?"
        description={thread ? `«${thread.title}» будет удалён из локальной истории вместе с черновиком. После подтверждения отменить действие нельзя.` : ''}
        confirmLabel="Удалить"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
