export type SharedChatAttachmentKind = 'image' | 'video' | 'audio' | 'file';

export const CHAT_ATTACHMENT_MAX_COUNT = 8;
export const CHAT_ATTACHMENT_MAX_TOTAL_BYTES = 120 * 1024 * 1024;

export const CHAT_ATTACHMENT_KIND_MAX_BYTES: Readonly<Record<SharedChatAttachmentKind, number>> = {
  image: 20 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  file: 30 * 1024 * 1024,
};

export const CHAT_UPLOAD_TTL_MS = 60 * 60 * 1000;
export const CHAT_UPLOAD_USAGE_WINDOW_MS = 60 * 60 * 1000;
export const CHAT_UPLOAD_HOURLY_COUNT_LIMIT = 60;
export const CHAT_UPLOAD_HOURLY_BYTE_LIMIT = 500 * 1024 * 1024;
export const CHAT_UPLOAD_MAX_PENDING_COUNT = 16;
export const CHAT_UPLOAD_MAX_PENDING_BYTES = 240 * 1024 * 1024;
