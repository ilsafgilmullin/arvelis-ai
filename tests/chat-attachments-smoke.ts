import assert from 'node:assert/strict';
import {
  CHAT_ATTACHMENT_MAX_COUNT,
  CHAT_ATTACHMENT_MAX_TOTAL_BYTES,
  attachmentKindForMime,
  formatAttachmentSize,
  formatVoiceDuration,
  isValidStoredAttachmentMeta,
  normalizeAttachmentName,
  validateAttachmentBatch,
  validateAttachmentCandidate,
} from '../src/chat/attachmentPolicy';
import {
  clearPendingChatAttachments,
  loadPendingChatAttachments,
  savePendingChatAttachments,
} from '../src/lib/chatPendingAttachmentStorage';
import type { ChatAttachmentMeta } from '../src/types';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem(key: string) { return storage.get(key) ?? null; },
      setItem(key: string, value: string) { storage.set(key, value); },
      removeItem(key: string) { storage.delete(key); },
    },
  },
});

assert.equal(attachmentKindForMime('image/jpeg'), 'image');
assert.equal(attachmentKindForMime('video/mp4'), 'video');
assert.equal(attachmentKindForMime('audio/mp4'), 'audio');
assert.equal(attachmentKindForMime('application/pdf'), 'file');
assert.equal(normalizeAttachmentName('  report\n final.pdf '), 'report final.pdf');
assert.equal(formatVoiceDuration(65_000), '1:05');
assert.equal(formatAttachmentSize(1024), '1.0 КБ');

const valid: ChatAttachmentMeta = {
  id: 'att_1234567890abcdef',
  kind: 'image',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 2 * 1024 * 1024,
  createdAt: Date.now(),
};
assert.equal(validateAttachmentCandidate(valid), null);
assert.equal(isValidStoredAttachmentMeta(valid), true);
assert.ok(validateAttachmentCandidate({ kind: 'video', size: 81 * 1024 * 1024 }));
assert.ok(validateAttachmentBatch([], Array.from({ length: CHAT_ATTACHMENT_MAX_COUNT + 1 }, (_, index) => ({ ...valid, id: `att_${String(index).padStart(12, '0')}` }))));
assert.ok(validateAttachmentBatch([], [{ ...valid, kind: 'video', size: CHAT_ATTACHMENT_MAX_TOTAL_BYTES }]));

const draftKey = 'account:12345678:thread:new';
assert.equal(savePendingChatAttachments(draftKey, [valid]), true);
assert.deepEqual(loadPendingChatAttachments(draftKey), [valid]);
const serialized = [...storage.values()].join('\n');
assert.equal(serialized.includes('data:image'), false, 'binary/data URL must never be stored in localStorage');
assert.equal(serialized.includes('blob:'), false, 'object URLs must never be stored in localStorage');
assert.equal(clearPendingChatAttachments(draftKey), true);
assert.deepEqual(loadPendingChatAttachments(draftKey), []);

assert.equal(savePendingChatAttachments('invalid-key', [valid]), false);
assert.equal(isValidStoredAttachmentMeta({ ...valid, id: '../unsafe' }), false);
assert.equal(isValidStoredAttachmentMeta({ ...valid, size: Number.POSITIVE_INFINITY }), false);

console.log('ARVELIS chat attachments smoke: PASS');
