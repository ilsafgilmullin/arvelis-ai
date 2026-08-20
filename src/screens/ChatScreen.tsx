import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  chatDraftKey,
  loadChatDraft,
  removeChatDraft,
  saveChatDraft,
} from '../lib/chatDraftStorage';
import type { DemoMessage, DemoThread } from '../types';

const MAX_MESSAGE_LENGTH = 6000;
const MAX_SEARCH_LENGTH = 160;
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

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDelta = Math.round((todayStart - dateStart) / 86_400_000);

  if (dayDelta === 0) return 'Сегодня';
  if (dayDelta === 1) return 'Вчера';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(date);
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
  const [message, setMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const [isAtEnd, setIsAtEnd] = useState(true);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
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
  const messageRef = useRef('');
  const draftSaveTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const pendingOwnSendRef = useRef(false);

  const title = useMemo(() => thread?.title ?? 'Новый диалог', [thread]);
  const draftKey = useMemo(() => chatDraftKey(thread?.id ?? null), [thread?.id]);
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
    setDeleteOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
    messageNodesRef.current.clear();

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

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
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
    setEditingMessage(item.content.slice(0, MAX_MESSAGE_LENGTH));
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

  const openSearch = () => {
    if (!thread) return;
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
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

  const confirmDelete = () => {
    if (!thread) return;
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
      <button className="chat-header-action chat-header-action--danger" type="button" onClick={() => setDeleteOpen(true)} aria-label="Удалить диалог" title="Удалить диалог">
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
              setSearchQuery(event.target.value.slice(0, MAX_SEARCH_LENGTH));
              setSearchIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Найти в диалоге"
            aria-label="Найти сообщение в диалоге"
            maxLength={MAX_SEARCH_LENGTH}
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
        {thread?.messages.length ? thread.messages.map((item, index) => {
          const previous = index > 0 ? thread.messages[index - 1] : undefined;
          const showDate = !previous || dayKey(previous.createdAt) !== dayKey(item.createdAt);
          const searchHit = item.id === activeSearchMessageId;
          const registerNode = (node: HTMLElement | null) => {
            if (node) messageNodesRef.current.set(item.id, node);
            else messageNodesRef.current.delete(item.id);
          };

          let content;
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
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={sendLimitReached}
          />
          {message.length >= 4800 ? <span className="chat-char-count">{message.length.toLocaleString('ru-RU')} / 6 000</span> : null}
          <button className="send-button" type="button" disabled={!message.trim() || sendLimitReached} onClick={submit} aria-label="Добавить сообщение в локальный preview-диалог"><SendIcon /></button>
        </div>
        {draftSaveFailed ? (
          <p className="chat-draft-warning" role="status">Черновик не удалось сохранить на устройстве.</p>
        ) : (
          <p className="chat-composer-helper">PREVIEW · Enter — отправить на компьютере · Shift+Enter — новая строка</p>
        )}
      </div>

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
