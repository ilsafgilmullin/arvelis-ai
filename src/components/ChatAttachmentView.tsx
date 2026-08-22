import { useEffect, useMemo, useState } from 'react';
import { formatAttachmentSize, formatVoiceDuration } from '../chat/attachmentPolicy';
import { loadChatAttachmentBlob } from '../lib/chatAttachmentStorage';
import type { ChatAttachmentMeta } from '../types';

function AttachmentCard({ attachment }: { attachment: ChatAttachmentMeta }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;
    setMissing(false);
    setObjectUrl(null);

    void loadChatAttachmentBlob(attachment.id).then((blob) => {
      if (!active) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      url = URL.createObjectURL(blob);
      setObjectUrl(url);
    });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id]);

  const meta = useMemo(() => {
    const size = formatAttachmentSize(attachment.size);
    if (attachment.kind === 'audio') return `${formatVoiceDuration(attachment.durationMs)} · ${size}`;
    return size;
  }, [attachment.durationMs, attachment.kind, attachment.size]);

  if (attachment.kind === 'image') {
    return (
      <article className="chat-attachment chat-attachment--image">
        {objectUrl ? <img src={objectUrl} alt={attachment.name} loading="lazy" /> : <div className="chat-attachment__placeholder">{missing ? 'Файл недоступен' : 'Загрузка…'}</div>}
        <div className="chat-attachment__meta"><strong>{attachment.name}</strong><span>{meta}</span></div>
      </article>
    );
  }

  if (attachment.kind === 'video') {
    return (
      <article className="chat-attachment chat-attachment--video">
        {objectUrl ? <video src={objectUrl} controls preload="metadata" playsInline /> : <div className="chat-attachment__placeholder">{missing ? 'Видео недоступно' : 'Загрузка…'}</div>}
        <div className="chat-attachment__meta"><strong>{attachment.name}</strong><span>{meta}</span></div>
      </article>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <article className="chat-attachment chat-attachment--audio">
        <div className="chat-attachment__audio-title"><span aria-hidden="true">◉</span><strong>Голосовое сообщение</strong></div>
        {objectUrl ? <audio src={objectUrl} controls preload="metadata" /> : <div className="chat-attachment__placeholder">{missing ? 'Аудио недоступно' : 'Загрузка…'}</div>}
        <span className="chat-attachment__audio-meta">{meta}</span>
      </article>
    );
  }

  return (
    <article className="chat-attachment chat-attachment--file">
      <div className="chat-attachment__file-icon" aria-hidden="true">DOC</div>
      <div className="chat-attachment__meta"><strong>{attachment.name}</strong><span>{meta}</span></div>
      {objectUrl ? <a href={objectUrl} download={attachment.name}>Открыть</a> : <span className="chat-attachment__missing">{missing ? 'Недоступен' : 'Загрузка…'}</span>}
    </article>
  );
}

export function ChatAttachmentView({ attachments }: { attachments?: ChatAttachmentMeta[] }) {
  if (!attachments?.length) return null;
  return <div className="chat-attachments" aria-label="Вложения сообщения">{attachments.map((attachment) => <AttachmentCard key={attachment.id} attachment={attachment} />)}</div>;
}
