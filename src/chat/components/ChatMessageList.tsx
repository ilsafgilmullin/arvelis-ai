import type { RefObject } from 'react';
import { BrandMark } from '../../components/Brand';
import { ChatAttachmentView } from '../../components/ChatAttachmentView';
import { CheckIcon, CopyIcon, EditIcon } from '../../components/Icons';
import type { ChatMessage } from '../../types';

export type ChatCopyFeedback = {
  id: string;
  status: 'copied' | 'error';
};

function formatMessageTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  } catch {
    return '';
  }
}

export function ChatMessageList({
  messages,
  activeSearchMessageId,
  copyFeedback,
  copyLabel,
  threadLimitReached,
  aiConnected,
  threadRef,
  endRef,
  onRegisterMessageNode,
  onCopy,
  onEdit,
}: {
  messages: ChatMessage[];
  activeSearchMessageId: string | null;
  copyFeedback: ChatCopyFeedback | null;
  copyLabel: (messageId: string) => string;
  threadLimitReached: boolean;
  aiConnected: boolean;
  threadRef: RefObject<HTMLDivElement | null>;
  endRef: RefObject<HTMLDivElement | null>;
  onRegisterMessageNode: (messageId: string, node: HTMLElement | null) => void;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
}) {
  return (
    <div ref={threadRef} className="chat-v3-thread" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.length ? messages.map((item) => {
        const searchHit = item.id === activeSearchMessageId;
        const user = item.role === 'user';
        return (
          <article
            key={item.id}
            ref={(node) => onRegisterMessageNode(item.id, node)}
            className={`chat-v3-message ${user ? 'chat-v3-message--user' : 'chat-v3-message--assistant'}${searchHit ? ' is-search-hit' : ''}`}
          >
            {!user ? <div className="chat-v3-assistant-label"><BrandMark size="compact" /><span>ARVELIS AI</span></div> : null}
            <ChatAttachmentView attachments={item.attachments} />
            {item.content.trim() ? <div className="chat-v3-message__text"><p>{item.content}</p></div> : null}
            <footer className="chat-v3-message__footer">
              <span>{formatMessageTime(item.createdAt)}</span>
              {item.content.trim() ? (
                <button type="button" onClick={() => onCopy(item)}>
                  {copyFeedback?.id === item.id && copyFeedback.status === 'copied' ? <CheckIcon /> : <CopyIcon />}
                  <span>{copyLabel(item.id)}</span>
                </button>
              ) : null}
              {user && item.content.trim() ? <button type="button" onClick={() => onEdit(item)}><EditIcon /><span>Изменить</span></button> : null}
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
  );
}
