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

function motionSafeBehavior(behavior: ScrollBehavior): ScrollBehavior {
  if (behavior !== 'smooth') return behavior;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return reducedMotion ? 'auto' : 'smooth';
}

function displaySystemMessage(content: string): string {
  const normalized = content.toLocaleLowerCase('ru-RU');
  if (normalized.includes('сохран') && (normalized.includes('ai-ответ') || normalized.includes('ai пока'))) {
    return 'Сохранено локально · AI пока не подключён';
  }
  return content;
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

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.remove();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const menuFirstActionRef = useRef<HTMLButtonElement>(null);
  const messageNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const copyRequestSequenceRef = useRef(0);
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
  const searchableMessages = useMemo(() => thread?.messages.map((item) => ({
    id: item.id,
    content: item.content.toLocaleLowerCase('ru-RU'),
  })) ?? [], [thread?.messages]);
  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return searchableMessages
      .filter((item) => item.content.includes(normalizedSearchQuery))
      .map((item) => item.id);
  }, [normalizedSearchQuery, searchableMessages]);
  const activeSearchMessageId = searchMatches.length
    ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)] ?? null
    : null;

  const setEndState = (next: boolean) => {
    isAtEndRef.current = next;
    setIsAtEnd((current) => current === next ? current : next);
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end', behavior: motionSafeBehavior(behavior) });
    });
  };

  const scrollToMessage = (messageId: string) => {
    window.requestAnimationFrame(() => {
      messageNodesRef.current.get(messageId)?.scrollIntoView({
        block: 'center',
        behavior: motionSafeBehavior('smooth'),
      });
    });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingMessage('');
  };

  useEffect(() => {
    setEditingMessageId(null);
    setEditingMessage('');
    setRenaming(false);
    setDeleteOpen(false);
    setMenuOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
    setCopyFeedback(null);
    copyRequestSequenceRef.current += 1;
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    messageNodesRef.current.clear();
    pendingOwnSendRef.current = false;
    setEndState(true);
  }, [draftKey]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 148)}px`;
  }, [message]);

  useEffect(() => {
    if (!thread?.messages.length) {
      setEndState(true);
      return;
    }
    scrollToLatest('auto');
  }, [thread?.id]);

  useEffect(() => {
    if (!thread?.messages.length) return;
    if (!pendingOwnSendRef.current && !isAtEndRef.current) return;
    scrollToLatest('smooth');
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
      rootMargin: '0px 0px 140px 0px',
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
  }, [editingMessageId, editingMessage.length]);

  useEffect(() => {
    if (!menuOpen) return;
    window.requestAnimationFrame(() => menuFirstActionRef.current?.focus());
  }, [menuOpen]);

  useEffect(() => () => {
    copyRequestSequenceRef.current += 1;
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!searchOpen || !activeSearchMessageId) return;
    scrollToMessage(activeSearchMessageId);
  }, [searchOpen, activeSearchMessageId]);

  useEffect(() => {
    if (!searchMatches.length) {
      if (searchIndex !== 0) setSearchIndex(0);
      return;
    }
    if (searchIndex >= searchMatches.length) setSearchIndex(0);
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

  useEffect(() => {
    if (!menuOpen && !renaming && !editingMessageId) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editingMessageId) {
        setEditingMessageId(null);
        setEditingMessage('');
      } else if (renaming) {
        setRenaming(false);
      } else {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [editingMessageId, menuOpen, renaming]);

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
    setMenuOpen(false);
    setRenaming(false);
    setEditingMessageId(item.id);
    setEditingMessage(item.content.slice(0, CHAT_MESSAGE_MAX_CHARS));
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
    closeSearch();
    cancelEditing();
    setMenuOpen(false);
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
    const requestSequence = ++copyRequestSequenceRef.current;
    const copied = await copyText(item.content);
    if (requestSequence !== copyRequestSequenceRef.current) return;

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
    setMenuOpen(false);
    setRenaming(false);
    cancelEditing();
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const moveSearch = (direction: 1 | -1) => {
    if (!searchMatches.length) return;
    setSearchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length);
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
    setMenuOpen(false);
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

  const handleNewChat = () => {
    setMenuOpen(false);
    closeSearch();
    cancelEditing();
    setRenaming(false);
    onNewChat();
  };

  const pageClassName = thread?.messages.length
    ? 'chat-page chat-experience chat-experience-v2'
    : 'chat-page chat-experience chat-experience-v2 chat-experience-v2--empty';

  return (
    <div className={pageClassName}>
      <header className="chat-v2-header">
        <div className="chat-v2-header__identity">
          <BrandMark size="compact" />
          <div className="chat-v2-header__copy">
            <span className="chat-v2-header__product">ARVELIS AI</span>
            <h1 title={title}>{title}</h1>
            <span className="chat-v2-header__status">Локальный preview · AI пока не подключён</span>
          </div>
        </div>

        {thread ? (
          <div className="chat-v2-header__actions">
            <button
              className={searchOpen ? 'chat-v2-icon-button chat-v2-icon-button--active' : 'chat-v2-icon-button'}
              type="button"
              onClick={searchOpen ? closeSearch : openSearch}
              aria-label={searchOpen ? 'Закрыть поиск по диалогу' : 'Поиск по диалогу'}
              aria-expanded={searchOpen}
              aria-controls="chat-search-panel"
            >
              <SearchIcon />
            </button>
            <button
              className={menuOpen ? 'chat-v2-icon-button chat-v2-icon-button--active' : 'chat-v2-icon-button'}
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-label="Действия с диалогом"
              aria-expanded={menuOpen}
            >
              <span className="chat-v2-more" aria-hidden="true">•••</span>
            </button>
          </div>
        ) : null}
      </header>

      {searchOpen && thread ? (
        <section id="chat-search-panel" className="chat-v2-search" role="search" aria-label="Поиск по текущему диалогу">
          <div className="chat-v2-search__field">
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
            <span className="chat-v2-search__count" aria-live="polite">
              {normalizedSearchQuery ? (searchMatches.length ? `${Math.min(searchIndex + 1, searchMatches.length)} / ${searchMatches.length}` : '0 / 0') : '—'}
            </span>
          </div>
          <div className="chat-v2-search__actions">
            <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(-1)} aria-label="Предыдущее совпадение">↑</button>
            <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(1)} aria-label="Следующее совпадение">↓</button>
            <button className="chat-v2-search__done" type="button" onClick={closeSearch}>Готово</button>
          </div>
        </section>
      ) : null}

      <div className="chat-thread chat-v2-thread" role="log" aria-live="polite" aria-relevant="additions text">
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
              <article ref={registerNode} className={searchHit ? 'message message--system preview-notice chat-v2-preview-notice message--search-hit' : 'message message--system preview-notice chat-v2-preview-notice'}>
                <span className="preview-notice__dot" aria-hidden="true" />
                <span>{displaySystemMessage(item.content)}</span>
              </article>
            );
          } else if (item.role === 'user') {
            content = (
              <article ref={registerNode} className={searchHit ? 'message message--user chat-v2-message chat-v2-message--user message--search-hit' : 'message message--user chat-v2-message chat-v2-message--user'}>
                <div className="message__bubble chat-v2-user-bubble"><p>{item.content}</p></div>
                <div className="message__footer message__footer--user chat-v2-message-footer">
                  <span className="message__time">{timeLabel(item.createdAt)}{item.editedAt ? ' · изменено' : ''}</span>
                  <div className="message__actions chat-v2-message-actions">
                    <button type="button" onClick={() => { void handleCopy(item); }} aria-label={`${copyLabel(item.id)} сообщение`} title={copyLabel(item.id)}>
                      {copyFeedback?.id === item.id && copyFeedback.status === 'copied' ? <CheckIcon /> : <CopyIcon />}
                      <span>{copyLabel(item.id)}</span>
                    </button>
                    <button type="button" onClick={() => startEditing(item)} aria-label="Изменить сообщение" title="Изменить сообщение"><EditIcon /><span>Изменить</span></button>
                  </div>
                </div>
              </article>
            );
          } else {
            content = (
              <article ref={registerNode} className={searchHit ? 'message message--assistant chat-v2-message chat-v2-message--assistant message--search-hit' : 'message message--assistant chat-v2-message chat-v2-message--assistant'}>
                <div className="assistant-label chat-v2-assistant-label">
                  <BrandMark size="compact" />
                  <span>ARVELIS AI</span>
                  <span className="chat-v2-preview-tag">{item.mock ? 'MOCK' : 'PREVIEW'}</span>
                </div>
                <p>{item.content}</p>
                {item.mock ? <span className="mock-disclaimer">Демонстрационный текст — не ответ модели.</span> : null}
                <div className="message__footer chat-v2-message-footer">
                  <span className="message__time">{timeLabel(item.createdAt)}</span>
                  <div className="message__actions chat-v2-message-actions">
                    <button type="button" onClick={() => { void handleCopy(item); }} aria-label={`${copyLabel(item.id)} сообщение ARVELIS AI`} title={copyLabel(item.id)}>
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
              {showDate ? <div className="chat-date-separator chat-v2-date-separator"><span>{dateLabel(item.createdAt)}</span></div> : null}
              {content}
            </Fragment>
          );
        }) : (
          <section className="chat-empty chat-v2-empty">
            <BrandMark size="compact" />
            <h2>{threadLimitReached ? 'Освободите место для нового диалога' : 'Чем помочь?'}</h2>
            <p>{threadLimitReached
              ? 'Локальный preview достиг лимита диалогов. Удалите ненужный диалог в истории и вернитесь сюда.'
              : 'Опишите задачу своими словами или начните с одной из заготовок.'}</p>
            {!threadLimitReached ? (
              <div className="chat-quick-starts chat-v2-quick-starts" aria-label="Быстрые заготовки">
                {QUICK_STARTS.map((item) => (
                  <button key={item.label} type="button" onClick={() => focusComposerWith(item.prompt)}>{item.label}</button>
                ))}
              </div>
            ) : null}
            <span className="chat-v2-empty__note">Сообщения сохраняются локально · AI пока не подключён</span>
          </section>
        )}
        <div ref={endRef} className="chat-thread__end" aria-hidden="true" />
      </div>

      <div ref={composerRef} className="chat-composer-wrap chat-v2-composer-wrap">
        {!isAtEnd && thread?.messages.length ? (
          <button className="chat-jump-latest chat-v2-jump-latest" type="button" onClick={() => scrollToLatest('smooth')} aria-label="Перейти к последнему сообщению">
            <ChevronDownIcon /><span>К последнему</span>
          </button>
        ) : null}
        {messageLimitReached && thread ? (
          <div className="chat-limit-notice chat-v2-limit-notice" role="status">
            <strong>Локальный лимит сообщений достигнут.</strong>
            <button type="button" onClick={handleNewChat} disabled={threadLimitReached}>Новый диалог</button>
          </div>
        ) : null}
        <div className="chat-composer chat-v2-composer">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => updateComposerMessage(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={focusComposer}
            onBlur={flushDraft}
            placeholder={sendLimitReached ? 'Отправка недоступна' : 'Сообщение'}
            aria-label="Сообщение"
            rows={1}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            disabled={sendLimitReached}
          />
          <button className="send-button chat-v2-send-button" type="button" disabled={!message.trim() || sendLimitReached} onClick={submit} aria-label="Отправить сообщение"><SendIcon /></button>
        </div>
        <div className="chat-v2-composer-meta">
          {draftSaveFailed ? <span className="chat-draft-warning" role="status">Черновик не удалось сохранить.</span> : <span className="chat-v2-composer-hint">Enter — отправить · Shift+Enter — новая строка</span>}
          {message.length >= CHAT_COMPOSER_COUNTER_THRESHOLD ? <span className="chat-char-count chat-v2-char-count">{message.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span> : null}
        </div>
      </div>

      <span className="chat-a11y-status" aria-live="polite">
        {copyFeedback ? (copyFeedback.status === 'copied' ? 'Сообщение скопировано' : 'Не удалось скопировать сообщение') : ''}
      </span>

      {menuOpen && thread ? (
        <div className="chat-v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
          <section className="chat-v2-sheet chat-v2-sheet--actions" role="dialog" aria-modal="true" aria-label="Действия с диалогом">
            <span className="chat-v2-sheet__handle" aria-hidden="true" />
            <div className="chat-v2-sheet__heading">
              <strong>Диалог</strong>
              <span>{thread.title}</span>
            </div>
            <div className="chat-v2-action-list">
              <button ref={menuFirstActionRef} type="button" onClick={handleNewChat} disabled={threadLimitReached}>
                <PlusIcon /><span><strong>Новый диалог</strong><small>{threadLimitReached ? 'Локальный лимит диалогов достигнут' : 'Начать чистый разговор'}</small></span>
              </button>
              <button type="button" onClick={startRenaming}><EditIcon /><span><strong>Переименовать</strong><small>Изменить название текущего диалога</small></span></button>
              <button className="chat-v2-action-list__danger" type="button" onClick={openDelete}><TrashIcon /><span><strong>Удалить</strong><small>Удалить диалог и его локальный черновик</small></span></button>
            </div>
            <button className="chat-v2-sheet__close" type="button" onClick={() => setMenuOpen(false)}>Закрыть</button>
          </section>
        </div>
      ) : null}

      {renaming && thread ? (
        <div className="chat-v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenaming(false); }}>
          <form className="chat-v2-sheet chat-v2-form-sheet" role="dialog" aria-modal="true" aria-labelledby="chat-rename-title" onSubmit={(event) => { event.preventDefault(); saveRename(); }}>
            <span className="chat-v2-sheet__handle" aria-hidden="true" />
            <div className="chat-v2-sheet__heading">
              <strong id="chat-rename-title">Переименовать диалог</strong>
              <span>Название помогает быстрее находить разговор в истории.</span>
            </div>
            <label htmlFor="chat-title-input">Название</label>
            <input
              ref={renameInputRef}
              id="chat-title-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value.slice(0, CHAT_THREAD_TITLE_MAX_CHARS))}
              onKeyDown={handleRenameKeyDown}
              maxLength={CHAT_THREAD_TITLE_MAX_CHARS}
              autoComplete="off"
            />
            <div className="chat-v2-form-sheet__actions">
              <button type="button" onClick={() => setRenaming(false)}>Отмена</button>
              <button className="chat-v2-primary-action" type="submit" disabled={!renameValue.trim()}>Сохранить</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingMessageId && thread ? (
        <div className="chat-v2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelEditing(); }}>
          <section className="chat-v2-sheet chat-v2-form-sheet" role="dialog" aria-modal="true" aria-labelledby="chat-edit-title">
            <span className="chat-v2-sheet__handle" aria-hidden="true" />
            <div className="chat-v2-sheet__heading">
              <strong id="chat-edit-title">Изменить сообщение</strong>
              <span>Редактируется только ваше локальное сообщение.</span>
            </div>
            <textarea
              ref={editTextareaRef}
              value={editingMessage}
              onChange={(event) => setEditingMessage(event.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS))}
              onKeyDown={handleEditKeyDown}
              maxLength={CHAT_MESSAGE_MAX_CHARS}
              rows={5}
              aria-label="Редактировать сообщение"
            />
            <span className="chat-v2-form-sheet__counter">{editingMessage.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span>
            <div className="chat-v2-form-sheet__actions">
              <button type="button" onClick={cancelEditing}>Отмена</button>
              <button className="chat-v2-primary-action" type="button" onClick={saveEditing} disabled={!editingMessage.trim()}>Сохранить</button>
            </div>
          </section>
        </div>
      ) : null}

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
