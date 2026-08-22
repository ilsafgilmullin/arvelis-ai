import {
  CHAT_ATTACHMENT_KIND_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_COUNT,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  CHAT_UPLOAD_HOURLY_BYTE_LIMIT,
  CHAT_UPLOAD_HOURLY_COUNT_LIMIT,
  CHAT_UPLOAD_MAX_PENDING_BYTES,
  CHAT_UPLOAD_MAX_PENDING_COUNT,
  CHAT_UPLOAD_TTL_MS,
  CHAT_UPLOAD_USAGE_WINDOW_MS,
} from '../../../shared/chatAttachmentLimits';
import type { ServerChatAttachmentKind } from '../contracts';

export {
  CHAT_ATTACHMENT_MAX_COUNT,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  CHAT_UPLOAD_HOURLY_BYTE_LIMIT,
  CHAT_UPLOAD_HOURLY_COUNT_LIMIT,
  CHAT_UPLOAD_MAX_PENDING_BYTES,
  CHAT_UPLOAD_MAX_PENDING_COUNT,
  CHAT_UPLOAD_TTL_MS,
  CHAT_UPLOAD_USAGE_WINDOW_MS,
};

export const CHAT_UPLOAD_HEAD_BYTES = 512;
export const CHAT_UPLOAD_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml',
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'kt', 'go', 'rs', 'c', 'h', 'cpp',
  'hpp', 'cs', 'php', 'rb', 'sh', 'sql', 'css', 'html', 'htm', 'log', 'ini',
  'toml', 'env',
]);

const OFFICE_ZIP_MIME: Readonly<Record<string, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

const LEGACY_OFFICE_MIME: Readonly<Record<string, string>> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
};

type UploadMetadata = {
  kind: ServerChatAttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
};

export type UploadPolicyResult =
  | { ok: true; value: UploadMetadata }
  | { ok: false; code: 'invalid_input' | 'unsupported_type' | 'file_too_large' };

export type UploadContentResult =
  | { ok: true; canonicalMimeType: string }
  | { ok: false; code: 'content_type_mismatch' | 'unsupported_type' };

function extension(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

function startsWithBytes(value: Uint8Array, bytes: readonly number[]): boolean {
  if (value.length < bytes.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (value[index] !== bytes[index]) return false;
  }
  return true;
}

function ascii(value: Uint8Array, start: number, length: number): string {
  if (value.length < start + length) return '';
  return String.fromCharCode(...value.slice(start, start + length));
}

function isIsoBmff(head: Uint8Array): boolean {
  return head.length >= 12 && ascii(head, 4, 4) === 'ftyp';
}

function isoBmffBrand(head: Uint8Array): string {
  return isIsoBmff(head) ? ascii(head, 8, 4).toLowerCase() : '';
}

function isHeifBrand(brand: string): boolean {
  return new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']).has(brand);
}

function isZip(head: Uint8Array): boolean {
  return startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04])
    || startsWithBytes(head, [0x50, 0x4b, 0x05, 0x06])
    || startsWithBytes(head, [0x50, 0x4b, 0x07, 0x08]);
}

function looksLikeText(head: Uint8Array): boolean {
  if (!head.length) return false;
  let suspicious = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) suspicious += 1;
  }
  return suspicious / head.length < 0.02;
}

function normalizedDeclaredMime(raw: string): string {
  return raw.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function compatibleDeclaredMime(declared: string, actual: string): boolean {
  if (!declared || declared === 'application/octet-stream') return true;
  if (declared === actual) return true;
  if (actual === 'image/jpeg' && (declared === 'image/jpg' || declared === 'image/pjpeg')) return true;
  if (actual === 'audio/mp4' && (declared === 'audio/x-m4a' || declared === 'audio/m4a')) return true;
  if (actual === 'video/mp4' && declared === 'application/mp4') return true;
  if (actual === 'text/plain' && declared.startsWith('text/')) return true;
  return false;
}

export function normalizeServerAttachmentName(raw: string): string {
  const normalized = raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 180);
}

export function validateUploadMetadata(input: UploadMetadata): UploadPolicyResult {
  const name = normalizeServerAttachmentName(input.name);
  const mimeType = normalizedDeclaredMime(input.mimeType);
  if (!name || name.length > 180 || mimeType.length > 180) return { ok: false, code: 'invalid_input' };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, code: 'invalid_input' };
  const maxBytes = CHAT_ATTACHMENT_KIND_MAX_BYTES[input.kind];
  if (input.sizeBytes > maxBytes) return { ok: false, code: 'file_too_large' };
  if (input.durationMs !== null
    && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > CHAT_UPLOAD_MAX_DURATION_MS)) {
    return { ok: false, code: 'invalid_input' };
  }
  return { ok: true, value: { ...input, name, mimeType } };
}

export function validateUploadedContent(input: {
  kind: ServerChatAttachmentKind;
  name: string;
  declaredMimeType: string;
  head: Uint8Array;
}): UploadContentResult {
  const { kind, name, head } = input;
  const declared = normalizedDeclaredMime(input.declaredMimeType);
  const ext = extension(name);
  let actual: string | null = null;

  if (kind === 'image') {
    if (startsWithBytes(head, [0xff, 0xd8, 0xff])) actual = 'image/jpeg';
    else if (startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) actual = 'image/png';
    else if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') actual = 'image/gif';
    else if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') actual = 'image/webp';
    else if (isIsoBmff(head) && isHeifBrand(isoBmffBrand(head))) {
      actual = isoBmffBrand(head).startsWith('av') ? 'image/avif' : 'image/heic';
    }
  } else if (kind === 'video') {
    if (startsWithBytes(head, [0x1a, 0x45, 0xdf, 0xa3])) actual = 'video/webm';
    else if (isIsoBmff(head) && !isHeifBrand(isoBmffBrand(head))) {
      actual = isoBmffBrand(head) === 'qt  ' || ext === 'mov' ? 'video/quicktime' : 'video/mp4';
    }
  } else if (kind === 'audio') {
    if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') actual = 'audio/wav';
    else if (ascii(head, 0, 4) === 'OggS') actual = 'audio/ogg';
    else if (startsWithBytes(head, [0x49, 0x44, 0x33]) || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) actual = 'audio/mpeg';
    else if (startsWithBytes(head, [0x1a, 0x45, 0xdf, 0xa3])) actual = 'audio/webm';
    else if (isIsoBmff(head) && !isHeifBrand(isoBmffBrand(head))) actual = 'audio/mp4';
  } else {
    if (startsWithBytes(head, [0x4d, 0x5a]) || startsWithBytes(head, [0x7f, 0x45, 0x4c, 0x46])) {
      return { ok: false, code: 'unsupported_type' };
    }
    if (ascii(head, 0, 5) === '%PDF-') actual = 'application/pdf';
    else if (isZip(head)) actual = OFFICE_ZIP_MIME[ext] ?? 'application/zip';
    else if (startsWithBytes(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
      actual = LEGACY_OFFICE_MIME[ext] ?? 'application/x-ole-storage';
    } else if (ascii(head, 0, 5) === '{\\rtf') actual = 'application/rtf';
    else if (startsWithBytes(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) actual = 'application/x-7z-compressed';
    else if (TEXT_EXTENSIONS.has(ext) && looksLikeText(head)) {
      actual = ext === 'json' || ext === 'jsonl' ? 'application/json'
        : ext === 'csv' ? 'text/csv'
          : 'text/plain';
    }
  }

  if (!actual) return { ok: false, code: 'unsupported_type' };
  if (!compatibleDeclaredMime(declared, actual)) return { ok: false, code: 'content_type_mismatch' };
  return { ok: true, canonicalMimeType: actual };
}

export function maxUploadBytes(kind: ServerChatAttachmentKind): number {
  return CHAT_ATTACHMENT_KIND_MAX_BYTES[kind];
}
