import assert from 'node:assert/strict';
import {
  conversationAttachmentIds,
  conversationTitleFromMessage,
  createConversation,
  createLocalUserMessage,
  isRenderableChatMessage,
  messageParts,
  renderableMessages,
} from '../src/chat/domain';
import type { ChatAttachmentMeta, ChatMessage } from '../src/types';

const image: ChatAttachmentMeta = {
  id: 'att_1234567890abcdef',
  kind: 'image',
  name: 'photo.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  createdAt: 1_700_000_000_000,
};

const userMessage = createLocalUserMessage({
  id: 'msg_user_123456',
  content: '  Проверить документ  ',
  attachments: [image],
  createdAt: 1_700_000_000_100,
});

assert.equal(userMessage.content, 'Проверить документ');
assert.equal(userMessage.status, 'local');
assert.deepEqual(messageParts(userMessage), [
  { type: 'text', text: 'Проверить документ' },
  { type: 'attachment', attachment: image },
]);
assert.equal(conversationTitleFromMessage(userMessage.content, [image]), 'Проверить документ');
assert.equal(conversationTitleFromMessage('', [image]), 'photo.jpg');
assert.equal(conversationTitleFromMessage('', [{ ...image, kind: 'audio', name: 'voice.m4a' }]), 'Голосовое сообщение');

const conversation = createConversation({
  id: 'thread_1234567890',
  message: userMessage,
});
assert.equal(conversation.messages.length, 1);
assert.equal(conversation.modelPreference, null);
assert.deepEqual(conversationAttachmentIds(conversation), [image.id]);

const legacyMock: ChatMessage = {
  id: 'msg_mock_123456',
  role: 'assistant',
  content: 'Старый mock',
  createdAt: 1_700_000_000_200,
  mock: true,
};
const legacySystem: ChatMessage = {
  id: 'msg_system_123456',
  role: 'system',
  content: 'Старый preview notice',
  createdAt: 1_700_000_000_300,
};

assert.equal(isRenderableChatMessage(userMessage), true);
assert.equal(isRenderableChatMessage(legacyMock), false);
assert.equal(isRenderableChatMessage(legacySystem), false);
assert.deepEqual(renderableMessages({ ...conversation, messages: [legacySystem, userMessage, legacyMock] }), [userMessage]);

console.log('ARVELIS chat domain smoke: PASS');
