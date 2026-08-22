import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { formatAttachmentSize, formatVoiceDuration } from '../attachmentPolicy';
import {
  AttachmentIcon,
  ChevronDownIcon,
  CloseIcon,
  MicIcon,
  ModelIcon,
  SendIcon,
  StopIcon,
} from '../../components/Icons';
import { CHAT_COMPOSER_COUNTER_THRESHOLD, CHAT_MESSAGE_MAX_CHARS } from '../../domain/chatPolicy';
import type { ChatAttachmentMeta } from '../../types';

function attachmentLabel(kind: ChatAttachmentMeta['kind']): string {
  if (kind === 'image') return 'Фото';
  if (kind === 'video') return 'Видео';
  if (kind === 'audio') return 'Аудио';
  return 'Файл';
}

export function ChatComposer({
  message,
  pendingAttachments,
  attachmentError,
  attachmentBusy,
  draftSaveFailed,
  sendLimitReached,
  aiConnected,
  modelLabel,
  selectedModelProviderLabel,
  voiceRecording,
  voiceElapsedMs,
  voiceError,
  canSubmit,
  textareaRef,
  fileInputRef,
  onMessageChange,
  onMessageKeyDown,
  onMessageBlur,
  onFileInput,
  onRemoveAttachment,
  onStartVoice,
  onCancelVoice,
  onStopVoice,
  onOpenModel,
  onSubmit,
}: {
  message: string;
  pendingAttachments: ChatAttachmentMeta[];
  attachmentError: string | null;
  attachmentBusy: boolean;
  draftSaveFailed: boolean;
  sendLimitReached: boolean;
  aiConnected: boolean;
  modelLabel: string;
  selectedModelProviderLabel?: string;
  voiceRecording: boolean;
  voiceElapsedMs: number;
  voiceError: string | null;
  canSubmit: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onMessageChange: (value: string) => void;
  onMessageKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onMessageBlur: () => void;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (attachment: ChatAttachmentMeta) => void;
  onStartVoice: () => void;
  onCancelVoice: () => void;
  onStopVoice: () => void;
  onOpenModel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      {pendingAttachments.length ? (
        <div className="chat-v3-pending" aria-label="Подготовленные вложения">
          {pendingAttachments.map((attachment) => (
            <div className="chat-v3-pending__item" key={attachment.id}>
              <div>
                <span>{attachmentLabel(attachment.kind)}</span>
                <strong>{attachment.kind === 'audio' ? `Голосовое · ${formatVoiceDuration(attachment.durationMs)}` : attachment.name}</strong>
                <small>{formatAttachmentSize(attachment.size)}</small>
              </div>
              <button type="button" onClick={() => onRemoveAttachment(attachment)} aria-label={`Удалить ${attachment.name}`}><CloseIcon /></button>
            </div>
          ))}
        </div>
      ) : null}

      {voiceRecording ? (
        <div className="chat-v3-recording" role="status">
          <span className="chat-v3-recording__pulse" aria-hidden="true" />
          <div><strong>Запись голоса</strong><span>{formatVoiceDuration(voiceElapsedMs)} / 5:00</span></div>
          <button type="button" onClick={onCancelVoice}>Отмена</button>
          <button className="chat-v3-recording__stop" type="button" onClick={onStopVoice}><StopIcon /><span>Готово</span></button>
        </div>
      ) : null}

      {(attachmentError || voiceError) ? <div className="chat-v3-error" role="alert">{attachmentError ?? voiceError}</div> : null}

      <div className="chat-v3-composer">
        <div className="chat-v3-tools">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sendLimitReached || attachmentBusy || voiceRecording} aria-label="Добавить фото, видео или файл"><AttachmentIcon /><span>Добавить</span></button>
          <button type="button" onClick={onStartVoice} disabled={sendLimitReached || attachmentBusy || voiceRecording} aria-label="Записать голосовое сообщение"><MicIcon /><span>Голос</span></button>
          <button type="button" onClick={onOpenModel} className="chat-v3-model-button"><ModelIcon /><span>{modelLabel}</span><ChevronDownIcon /></button>
        </div>

        <input
          ref={fileInputRef}
          className="chat-v3-file-input"
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={onFileInput}
        />

        <div className="chat-v3-input-row">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={onMessageKeyDown}
            onBlur={onMessageBlur}
            placeholder={sendLimitReached ? 'Новый диалог недоступен' : 'Сообщение'}
            aria-label="Сообщение"
            rows={1}
            maxLength={CHAT_MESSAGE_MAX_CHARS}
            disabled={sendLimitReached || voiceRecording}
          />
          <button className="chat-v3-send" type="button" disabled={!canSubmit} onClick={onSubmit} aria-label={aiConnected ? 'Отправить сообщение' : 'Сохранить сообщение в диалоге'}><SendIcon /></button>
        </div>

        <div className="chat-v3-composer-meta">
          {draftSaveFailed
            ? <span role="status">Черновик текста не удалось сохранить.</span>
            : !aiConnected
              ? <span>AI-провайдер не подключён</span>
              : <span>{selectedModelProviderLabel}</span>}
          {message.length >= CHAT_COMPOSER_COUNTER_THRESHOLD
            ? <span>{message.length.toLocaleString('ru-RU')} / {CHAT_MESSAGE_MAX_CHARS.toLocaleString('ru-RU')}</span>
            : null}
        </div>
      </div>
    </>
  );
}
