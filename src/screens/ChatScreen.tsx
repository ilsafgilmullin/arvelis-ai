import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { CHAT_MODEL_UNAVAILABLE_LABEL, CONNECTED_CHAT_MODELS } from '../ai/chatModelCatalog';
import {
  attachmentKindForMime,
  formatAttachmentSize,
  formatVoiceDuration,
  normalizeAttachmentName,
  validateAttachmentBatch,
  validateAttachmentCandidate,
} from '../chat/attachmentPolicy';
import { BrandMark } from '../components/Brand';
import { ChatAttachmentView } from '../components/ChatAttachmentView';
import { ChatSheet } from '../components/ChatSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  AttachmentIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  MicIcon,
  ModelIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  StopIcon,
  TrashIcon,
} from '../components/Icons';
import {
  CHAT_COMPOSER_COUNTER_THRESHOLD,
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_SEARCH_MAX_CHARS,
  CHAT_THREAD_TITLE_MAX_CHARS,
} from '../domain/chatPolicy';
import { useChatDraft } from '../hooks/useChatDraft';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import {
  deleteChatAttachmentBlob,
  deleteChatAttachmentBlobs,
  loadChatAttachmentBlob,
  saveChatAttachmentBlob,
} from '../lib/chatAttachmentStorage';
import { chatDraftKey } from '../lib/chatDraftStorage';
import {
  clearPendingChatAttachments,
  loadPendingChatAttachments,
  savePendingChatAttachments,
} from '../lib/chatPendingAttachmentStorage';
import type { ChatAttachmentMeta, DemoMessage, DemoThread } from '../types';

const VOICE_MAX_DURATION_MS = 5 * 60 * 1000;

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

function motionSafeBehavior(behavior: ScrollBehavior): ScrollBehavior {
  if (behavior !== 'smooth') return behavior;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return reducedMotion ? 'auto' : 'smooth';
}

function createAttachmentId(): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '');
  return random ? `att_${random}` : `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function attachmentLabel(kind: ChatAttachmentMeta['kind']): string {
  if (kind === 'image') return 'Фото';
  if (kind === 'video') return 'Видео';
  if (kind === 'audio') return 'Аудио';
  return 'Файл';
}

function formatMessageTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  } catch {
    return '';
  }
}

async function copyText(content: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {
    // Fall through to the DOM fallback below.
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

type IncomingAttachment = {
  blob: Blob;
  name: string;
  mimeType: string;
  durationMs?: number;
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
  onSend: (content: string, attachments?: ChatAttachmentMeta[]) => void;
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
  const [modelOpen, setModelOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(CONNECTED_CHAT_MODELS[0]?.id ?? null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentMeta[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
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

  const selectedModel = CONNECTED_CHAT_MODELS.find((model) => model.id === selectedModelId) ?? null;
  const modelLabel = selectedModel?.label ?? CHAT_MODEL_UNAVAILABLE_LABEL;
  const aiConnected = CONNECTED_CHAT_MODELS.length > 0;
  const sendLimitReached = thread ? messageLimitReached : threadLimitReached;
  const visibleMessages = useMemo(() => (thread?.messages ?? []).filter((item) => item.role !== 'system' && !(item.role === 'assistant' && item.mock)), [thread?.messages]);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('ru-RU');
  const searchableMessages = useMemo(() => visibleMessages
    .filter((item) => item.content.trim())
    .map((item) => ({ id: item.id, content: item.content.toLocaleLowerCase('ru-RU') })), [visibleMessages]);
  const searchMatches = useMemo(() => {
    if (!normalizedSearchQuery) return [];
    return searchableMessages.filter((item) => item.content.includes(normalizedSearchQuery)).map((item) => item.id);
  }, [normalizedSearchQuery, searchableMessages]);
  const activeSearchMessageId = searchMatches.length ? searchMatches[Math.min(searchIndex, searchMatches.length - 1)] ?? null : null;

  const addIncomingAttachments = async (incoming: IncomingAttachment[]) => {
    if (!incoming.length || attachmentBusy) return;
    setAttachmentError(null);
    setAttachmentBusy(true);

    const nextMetas: ChatAttachmentMeta[] = [];
    for (const item of incoming) {
      const kind = attachmentKindForMime(item.mimeType);
      const meta: ChatAttachmentMeta = {
        id: createAttachmentId(),
        kind,
        name: normalizeAttachmentName(item.name, kind === 'audio' ? 'Голосовое сообщение' : 'Файл'),
        mimeType: item.mimeType.slice(0, 180),
        size: item.blob.size,
        createdAt: Date.now(),
        ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
      };
      const validationError = validateAttachmentCandidate(meta);
      if (validationError) {
        setAttachmentError(validationError);
        setAttachmentBusy(false);
        return;
      }
      nextMetas.push(meta);
    }

    const batchError = validateAttachmentBatch(pendingAttachments, nextMetas);
    if (batchError) {
      setAttachmentError(batchError);
      setAttachmentBusy(false);
      return;
    }

    const savedIds: string[] = [];
    for (let index = 0; index < incoming.length; index += 1) {
      const meta = nextMetas[index];
      const item = incoming[index];
      if (!meta || !item || !(await saveChatAttachmentBlob(meta.id, item.blob))) {
        await deleteChatAttachmentBlobs(savedIds);
        setAttachmentError('Не удалось сохранить вложение на этом устройстве.');
        setAttachmentBusy(false);
        return;
      }
      savedIds.push(meta.id);
    }

    const next = [...pendingAttachments, ...nextMetas];
    if (!savePendingChatAttachments(draftKey, next)) {
      await deleteChatAttachmentBlobs(savedIds);
      setAttachmentError('Не удалось сохранить состояние вложений.');
      setAttachmentBusy(false);
      return;
    }

    setPendingAttachments(next);
    setAttachmentBusy(false);
  };

  const voiceRecorder = useVoiceRecorder((result) => {
    const extension = result.mimeType.includes('mp4') ? 'm4a' : result.mimeType.includes('webm') ? 'webm' : 'audio';
    void addIncomingAttachments([{
      blob: result.blob,
      mimeType: result.mimeType,
      name: `Голосовое сообщение.${extension}`,
      durationMs: result.durationMs,
    }]);
  });

  useEffect(() => {
    if (voiceRecorder.recording && voiceRecorder.elapsedMs >= VOICE_MAX_DURATION_MS) voiceRecorder.stop();
  }, [voiceRecorder.elapsedMs, voiceRecorder.recording, voiceRecorder.stop]);

  useEffect(() => {
    let active = true;
    const stored = loadPendingChatAttachments(draftKey);
    void Promise.all(stored.map(async (attachment) => ({ attachment, exists: Boolean(await loadChatAttachmentBlob(attachment.id)) }))).then((results) => {
      if (!active) return;
      const available = results.filter((item) => item.exists).map((item) => item.attachment);
      setPendingAttachments(available);
      if (available.length !== stored.length) savePendingChatAttachments(draftKey, available);
    });
    return () => { active = false; };
  }, [draftKey]);

  const setEndState = (next: boolean) => {
    isAtEndRef.current = next;
    setIsAtEnd((current) => current === next ? current : next);
  };

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: motionSafeBehavior(behavior) }));
  };

  const scrollToMessage = (messageId: string) => {
    window.requestAnimationFrame(() => messageNodesRef.current.get(messageId)?.scrollIntoView({ block: 'center', behavior: motionSafeBehavior('smooth') }));
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
    setAttachmentError(null);
    setModelOpen(false);
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
    if (!visibleMessages.length) {
      setEndState(true);
      return;
    }
    scrollToLatest('auto');
  }, [thread?.id]);

  useEffect(() => {
    if (!visibleMessages.length) return;
    if (!pendingOwnSendRef.current && !isAtEndRef.current) return;
    scrollToLatest('smooth');
    pendingOwnSendRef.current = false;
  }, [thread?.id, visibleMessages.length]);

  useEffect(() => {
    const end = endRef.current;
    const root = threadRef.current;
    if (!end || !root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setEndState(entry.isIntersecting);
    }, { root, rootMargin: '0px 0px 96px 0px', threshold: 0.01 });
    observer.observe(end);
    return () => observer.disconnect();
  }, [thread?.id]);

  useEffect(() => () => {
    copyRequestSequenceRef.current += 1;
    if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (searchOpen && activeSearchMessageId) scrollToMessage(activeSearchMessageId);
  }, [searchOpen, activeSearchMessageId]);

  useEffect(() => {
    if (!searchMatches.length && searchIndex !== 0) setSearchIndex(0);
    else if (searchMatches.length && searchIndex >= searchMatches.length) setSearchIndex(0);
  }, [searchIndex, searchMatches.length]);

  const submit = () => {
    const content = message.trim();
    if ((!content && !pendingAttachments.length) || sendLimitReached || attachmentBusy || voiceRecorder.recording) return;
    pendingOwnSendRef.current = true;
    clearDraft();
    clearPendingChatAttachments(draftKey);
    const attachments = pendingAttachments;
    setPendingAttachments([]);
    onSend(content, attachments);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || isCoarsePointer()) return;
    event.preventDefault();
    submit();
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    void addIncomingAttachments(files.map((file) => ({
      blob: file,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
    })));
  };

  const removePendingAttachment = async (attachment: ChatAttachmentMeta) => {
    const next = pendingAttachments.filter((item) => item.id !== attachment.id);
    setPendingAttachments(next);
    savePendingChatAttachments(draftKey, next);
    await deleteChatAttachmentBlob(attachment.id);
  };

  const startEditing = (item: DemoMessage) => {
    if (item.role !== 'user' || !item.content.trim()) return;
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
  };

  const saveRename = () => {
    if (!thread) return;
    const normalized = renameValue.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    onRenameThread(thread.id, normalized);
    setRenaming(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    saveRename();
  };

  const handleCopy = async (item: DemoMessage) => {
    if (!item.content.trim()) return;
    const requestSequence = ++copyRequestSequenceRef.current;
    const copied = await copyText(item.content);
    if (requestSequence !== copyRequestSequenceRef.current) return;
    setCopyFeedback({ id: item.id, status: copied ? 'copied' : 'error' });
    if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
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
    if (searchMatches.length) setSearchIndex((current) => (current + direction + searchMatches.length) % searchMatches.length);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    } else if (event.key === 'Enter' && searchMatches.length) {
      event.preventDefault();
      moveSearch(event.shiftKey ? -1 : 1);
    }
  };

  const handleNewChat = () => {
    setMenuOpen(false);
    closeSearch();
    cancelEditing();
    setRenaming(false);
    onNewChat();
  };

  const pageClassName = visibleMessages.length ? 'chat-page chat-v3' : 'chat-page chat-v3 chat-v3--empty';
  const canSubmit = !sendLimitReached && !attachmentBusy && !voiceRecorder.recording && Boolean(message.trim() || pendingAttachments.length);

  return (
    <div className={pageClassName}>
      <header className="chat-v3-header">
        <div className="chat-v3-header__identity">
          <BrandMark size="compact" />
          <div>
            <span>ARVELIS AI</span>
            <h1 title={title}>{title}</h1>
          </div>
        </div>
        {thread ? (
          <div className="chat-v3-header__actions">
            <button type="button" className={searchOpen ? 'chat-v3-icon-button is-active' : 'chat-v3-icon-button'} onClick={searchOpen ? closeSearch : openSearch} aria-label="Поиск по диалогу"><SearchIcon /></button>
            <button type="button" className={menuOpen ? 'chat-v3-icon-button is-active' : 'chat-v3-icon-button'} onClick={() => setMenuOpen((current) => !current)} aria-label="Действия с диалогом"><span aria-hidden="true">•••</span></button>
          </div>
        ) : null}
      </header>

      {searchOpen && thread ? (
        <section className="chat-v3-search" role="search">
          <SearchIcon />
          <input ref={searchInputRef} value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value.slice(0, CHAT_SEARCH_MAX_CHARS)); setSearchIndex(0); }} onKeyDown={handleSearchKeyDown} placeholder="Найти в диалоге" maxLength={CHAT_SEARCH_MAX_CHARS} />
          <span>{normalizedSearchQuery ? (searchMatches.length ? `${Math.min(searchIndex + 1, searchMatches.length)} / ${searchMatches.length}` : '0 / 0') : '—'}</span>
          <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(-1)} aria-label="Предыдущее совпадение">↑</button>
          <button type="button" disabled={!searchMatches.length} onClick={() => moveSearch(1)} aria-label="Следующее совпадение">↓</button>
          <button type="button" onClick={closeSearch}>Готово</button>
        </section>
      ) : null}

      <div ref={threadRef} className="chat-v3-thread" role="log" aria-live="polite" aria-relevant="additions text">
        {visibleMessages.length ? visibleMessages.map((item) => {
          const searchHit = item.id === activeSearchMessageId;
          const registerNode = (node: HTMLElement | null) => {
            if (node) messageNodesRef.current.set(item.id, node);
            else messageNodesRef.current.delete(item.id);
          };
          const user = item.role === 'user';
          return (
            <article key={item.id} ref={registerNode} className={`chat-v3-message ${user ? 'chat-v3-message--user' : 'chat-v3-message--assistant'}${searchHit ? ' is-search-hit' : ''}`}>
              {!user ? <div className="chat-v3-assistant-label"><BrandMark size="compact" /><span>ARVELIS AI</span></div> : null}
              <ChatAttachmentView attachments={item.attachments} />
              {item.content.trim() ? <div className="chat-v3-message__text"><p>{item.content}</p></div> : null}
              <footer className="chat-v3-message__footer">
                <span>{formatMessageTime(item.createdAt)}</span>
                {item.content.trim() ? <button type="button" onClick={() => { void handleCopy(item); }}>{copyFeedback?.id === item.id && copyFeedback.status === 'copied' ? <CheckIcon /> : <CopyIcon />}<span>{copyLabel(item.id)}</span></button> : null}
                {user && item.content.trim() ? <button type="button" onClick={() => startEditing(item)}><EditIcon /><span>Изменить</span></button> : null}
              </footer>
            </article>
          );
        }) : (
          <section className="chat-v3-empty">
            <BrandMark size="default" />
            <p className="section-kicker">НОВЫЙ ДИАЛОГ</p>
            <h2>{threadLimitReached ? 'Освободите место для нового диалога' : 'Что нужно сделать?'}</h2>
            <p>{threadLimitReached ? 'Удалите ненужный диалог в Истории, чтобы начать новый.' : 'Напишите запрос или добавьте фото, видео, файл либо голосовое сообщение.'}</p>
            {!aiConnected ? <span className="chat-v3-empty__status">AI-модель пока не подключена. Сообщения и вложения сохраняются на этом устройстве без искусственных ответов.</span> : null}
          </section>
        )}
        <div ref={endRef} className="chat-thread__end" aria-hidden="true" />
      </div>

      <div className="chat-v3-composer-wrap">
        {!isAtEnd && visibleMessages.length ? <button className="chat-v3-jump" type="button" onClick={() => scrollToLatest('smooth')}><ChevronDownIcon /><span>К последнему</span></button> : null}

        {pendingAttachments.length ? (
          <div className="chat-v3-pending" aria-label="Подготовленные вложения">
            {pendingAttachments.map((attachment) => (
              <div className="chat-v3-pending__item" key={attachment.id}>
                <div><span>{attachmentLabel(attachment.kind)}</span><strong>{attachment.kind === 'audio' ? `Голосовое · ${formatVoiceDuration(attachment.durationMs)}` : attachment.name}</strong><small>{formatAttachmentSize(attachment.size)}</small></div>
                <button type="button" onClick={() => { void removePendingAttachment(attachment); }} aria-label={`Удалить ${attachment.name}`}><CloseIcon /></button>
              </div>
            ))}
          </div>
        ) : null}

        {voiceRecorder.recording ? (
          <div className="chat-v3-recording" role="status">
            <span className="chat-v3-recording__pulse" aria-hidden="true" />
            <div><strong>Запись голоса</strong><span>{formatVoiceDuration(voiceRecorder.elapsedMs)} / 5:00</span></div>
            <button type="button" onClick={voiceRecorder.cancel}>Отмена</button>
            <button className="chat-v3-recording__stop" type="button" onClick={voiceRecorder.stop}><StopIcon /><span>Готово</span></button>
          </div>
        ) : null}

        {(attachmentError || voiceRecorder.error) ? <div className="chat-v3-error" role="alert">{attachmentError ?? voiceRecorder.error}</div> : null}

        <div className="chat-v3-composer">
          <div className="chat-v3-tools">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sendLimitReached || attachmentBusy || voiceRecorder.recording} aria-label="Добавить фото, видео или файл"><AttachmentIcon /><span>Добавить</span></button>
            <button type="button" onClick={() => { setAttachmentError(null); void voiceRecorder.start(); }} disabled={sendLimitReached || attachmentBusy || voiceRecorder.recording} aria-label="Записать голосовое сообщение"><MicIcon /><span>Голос</span></button>
            <button type="button" onClick={() => setModelOpen(true)} className="chat-v3-model-button"><ModelIcon /><span>{modelLabel}</span><ChevronDownIcon /></button>
          </div>

          <input ref={fileInputRef} className="chat-v3-file-input" type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={handleFileInput} />

          <div className="chat-v3-input-row">
            <textarea ref={textareaRef} value={message} onChange={(event) => updateComposerMessage(event.target.value)} onKeyDown={handleKeyDown} onBlur={flushDraft} placeholder={sendLimitReached ? 'Новый диалог недоступен' : 'Сообщение'} aria-label="Сообщение" rows={1} maxLength={CHAT_MESSAGE_MAX_CHARS} disabled={sendLimitReached || voiceRecorder.recording} />
            <button className="chat-v3-send" type="button" disabled={!canSubmit} onClick={submit} aria-label={aiConnected ? 'Отправить сообщение' : 'Сохранить сообщение в диалоге'}><SendIcon /></button>
          </div>

          <div className="chat-v3-composer-meta">
            {draftSaveFailed ? <span role="status">Черновик текста не удалось сохранить.</span> : !aiConnected ? <span>AI-провайдер не подключён</span> : <span>{selectedModel?.providerLabel}</span>}
            {message.length >= CHAT_COMPOSER_COUNTER_THRESHOLD ? <span>{message.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span> : null}
          </div>
        </div>
      </div>

      <span className="chat-a11y-status" aria-live="polite">{copyFeedback ? (copyFeedback.status === 'copied' ? 'Сообщение скопировано' : 'Не удалось скопировать сообщение') : ''}</span>

      {modelOpen ? (
        <ChatSheet onClose={() => setModelOpen(false)} ariaLabel="Выбор модели" className="chat-v3-model-sheet">
          <span className="chat-v2-sheet__handle" aria-hidden="true" />
          <div className="chat-v3-sheet-heading"><strong>Модель</strong><span>Показываем только реально подключённые AI-модели.</span></div>
          {CONNECTED_CHAT_MODELS.length ? <div className="chat-v3-model-list">{CONNECTED_CHAT_MODELS.map((model) => <button key={model.id} type="button" className={selectedModelId === model.id ? 'is-selected' : ''} onClick={() => { setSelectedModelId(model.id); setModelOpen(false); }}><div><strong>{model.label}</strong><span>{model.providerLabel}</span></div>{selectedModelId === model.id ? <CheckIcon /> : null}</button>)}</div> : <div className="chat-v3-model-empty"><ModelIcon /><strong>AI-модели ещё не подключены</strong><p>Selector готов технически, но ARVELIS не показывает выдуманные модели. Список появится после подключения реального provider gateway.</p></div>}
          <button className="chat-v2-sheet__close" type="button" onClick={() => setModelOpen(false)}>Закрыть</button>
        </ChatSheet>
      ) : null}

      {menuOpen && thread ? (
        <ChatSheet onClose={() => setMenuOpen(false)} ariaLabel="Действия с диалогом" className="chat-v2-sheet--actions">
          <span className="chat-v2-sheet__handle" aria-hidden="true" />
          <div className="chat-v3-sheet-heading"><strong>Диалог</strong><span>{thread.title}</span></div>
          <div className="chat-v2-action-list">
            <button data-chat-sheet-autofocus type="button" onClick={handleNewChat} disabled={threadLimitReached}><PlusIcon /><span><strong>Новый диалог</strong><small>Начать чистый разговор</small></span></button>
            <button type="button" onClick={startRenaming}><EditIcon /><span><strong>Переименовать</strong><small>Изменить название</small></span></button>
            <button className="chat-v2-action-list__danger" type="button" onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}><TrashIcon /><span><strong>Удалить</strong><small>Удалить диалог и его вложения</small></span></button>
          </div>
          <button className="chat-v2-sheet__close" type="button" onClick={() => setMenuOpen(false)}>Закрыть</button>
        </ChatSheet>
      ) : null}

      {renaming && thread ? (
        <ChatSheet onClose={() => setRenaming(false)} ariaLabelledBy="chat-rename-title" className="chat-v2-form-sheet">
          <span className="chat-v2-sheet__handle" aria-hidden="true" />
          <div className="chat-v3-sheet-heading"><strong id="chat-rename-title">Переименовать диалог</strong><span>Название используется в Главной и Истории.</span></div>
          <label htmlFor="chat-title-input">Название</label>
          <input data-chat-sheet-autofocus data-chat-sheet-select="all" id="chat-title-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value.slice(0, CHAT_THREAD_TITLE_MAX_CHARS))} onKeyDown={handleRenameKeyDown} maxLength={CHAT_THREAD_TITLE_MAX_CHARS} autoComplete="off" />
          <div className="chat-v2-form-sheet__actions"><button type="button" onClick={() => setRenaming(false)}>Отмена</button><button className="chat-v2-primary-action" type="button" onClick={saveRename} disabled={!renameValue.trim()}>Сохранить</button></div>
        </ChatSheet>
      ) : null}

      {editingMessageId && thread ? (
        <ChatSheet onClose={cancelEditing} ariaLabelledBy="chat-edit-title" className="chat-v2-form-sheet">
          <span className="chat-v2-sheet__handle" aria-hidden="true" />
          <div className="chat-v3-sheet-heading"><strong id="chat-edit-title">Изменить сообщение</strong><span>Вложения остаются без изменений.</span></div>
          <textarea data-chat-sheet-autofocus data-chat-sheet-select="end" value={editingMessage} onChange={(event) => setEditingMessage(event.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS))} onKeyDown={handleEditKeyDown} maxLength={CHAT_MESSAGE_MAX_CHARS} rows={5} aria-label="Редактировать сообщение" />
          <span className="chat-v2-form-sheet__counter">{editingMessage.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span>
          <div className="chat-v2-form-sheet__actions"><button type="button" onClick={cancelEditing}>Отмена</button><button className="chat-v2-primary-action" type="button" onClick={saveEditing} disabled={!editingMessage.trim()}>Сохранить</button></div>
        </ChatSheet>
      ) : null}

      <ConfirmDialog open={deleteOpen} title="Удалить диалог?" description={thread ? `«${thread.title}» и связанные с ним локальные вложения будут удалены с этого устройства. Отменить действие после подтверждения нельзя.` : ''} confirmLabel="Удалить" danger onConfirm={() => { if (thread) onDeleteThread(thread.id); setDeleteOpen(false); }} onCancel={() => setDeleteOpen(false)} />
    </div>
  );
}
