import {
  ServerChatRepositoryError,
  ServerConversationRepository,
} from '../src/chat/serverConversationRepository';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const conversation = {
  id: 'a'.repeat(32),
  title: 'Серверный диалог',
  modelPreference: null,
  createdAt: 1_000,
  updatedAt: 2_000,
  version: 3,
};

const message = {
  id: 'b'.repeat(32),
  role: 'user',
  status: 'completed',
  content: 'Сообщение',
  position: 0,
  createdAt: 1_000,
  editedAt: null,
  attachments: [],
};

async function main(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, ...(init === undefined ? {} : { init }) });

      if (url.includes('cursor=broken-server')) {
        return jsonResponse({ items: [{ ...conversation, id: 'not-an-id', messageCount: 1, latestMessageContent: null, latestAttachmentKind: null }], nextCursor: null });
      }
      if (url.endsWith(`/conversations/${'f'.repeat(32)}`)) {
        return jsonResponse({ error: { code: 'not_found', message: 'Conversation not found' } }, 404);
      }
      if (url.includes('/messages/') && init?.method === 'PATCH') {
        return jsonResponse({ conversation, message: { ...message, content: 'Исправлено', editedAt: 3_000 } });
      }
      if (url.endsWith(`/conversations/${conversation.id}`) && init?.method === 'PATCH') {
        return jsonResponse({ conversation: { ...conversation, title: 'Новое имя', version: 4, updatedAt: 4_000 } });
      }
      if (url.endsWith(`/conversations/${conversation.id}`) && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith(`/conversations/${conversation.id}`) || url.includes(`/conversations/${conversation.id}?`)) {
        return jsonResponse({
          conversation,
          messages: [{
            ...message,
            attachments: [{
              id: 'c'.repeat(32),
              kind: 'file',
              name: 'doc.txt',
              mimeType: 'text/plain',
              size: 12,
              durationMs: null,
              storageState: 'ready',
              createdAt: 1_100,
            }],
          }],
          nextMessageCursor: 'older-cursor',
        });
      }
      if (url.includes('/conversations?')) {
        return jsonResponse({
          items: [{
            ...conversation,
            messageCount: 1,
            latestMessageContent: 'Сообщение',
            latestAttachmentKind: null,
          }],
          nextCursor: 'next-cursor',
        });
      }
      if (url.endsWith('/conversations') && init?.method === 'POST') {
        return jsonResponse({ conversation, message }, 201);
      }
      if (url.endsWith(`/conversations/${conversation.id}/messages`) && init?.method === 'POST') {
        return jsonResponse({ conversation: { ...conversation, version: 4, updatedAt: 2_500 }, message: { ...message, id: 'd'.repeat(32), position: 1, createdAt: 2_500 } }, 201);
      }
      return jsonResponse({ error: { code: 'invalid_input', message: 'Unexpected smoke request' } }, 400);
    }) as typeof fetch;

    const repository = new ServerConversationRepository('/api/chat');

    const list = await repository.listPage({ limit: 20, cursor: 'cursor-one' });
    assert(list.items.length === 1, 'Server repository must parse conversation summary');
    assert(list.items[0]?.messageCount === 1, 'Server repository must preserve message count');
    assert(list.nextCursor === 'next-cursor', 'Server repository must preserve list cursor');
    assert(calls.at(-1)?.url.includes('limit=20'), 'Server repository must send list limit');
    assert(calls.at(-1)?.url.includes('cursor=cursor-one'), 'Server repository must send list cursor');

    const page = await repository.getPage(conversation.id, { limit: 60, cursor: 'older' });
    assert(page?.conversation.version === 3, 'Server repository must parse conversation metadata');
    assert(page?.messages[0]?.attachments?.[0]?.storageState === 'ready', 'Server repository must parse safe attachment state');
    assert(page?.nextMessageCursor === 'older-cursor', 'Server repository must preserve message cursor');

    const created = await repository.create({ content: 'Сообщение', attachments: [] });
    assert(created.message.content === 'Сообщение', 'Server repository must parse create mutation');
    const createCall = calls.at(-1);
    const createHeaders = new Headers(createCall?.init?.headers);
    assert(createCall?.init?.credentials === 'same-origin', 'Mutation must use same-origin credentials');
    assert(createCall?.init?.cache === 'no-store', 'Mutation must bypass browser response cache');
    assert(createHeaders.get('X-ARVELIS-Request') === '1', 'Mutation must carry same-origin request marker');
    assert(createHeaders.get('Content-Type') === 'application/json', 'Mutation must send JSON content type');

    const callCountBeforeAttachment = calls.length;
    let attachmentRejected = false;
    try {
      await repository.create({
        content: 'С файлом',
        attachments: [{
          id: 'e'.repeat(32),
          kind: 'file',
          name: 'local.txt',
          mimeType: 'text/plain',
          size: 1,
          createdAt: 1,
        }],
      });
    } catch (error) {
      attachmentRejected = error instanceof ServerChatRepositoryError && error.code === 'attachments_not_ready';
    }
    assert(attachmentRejected, 'Server repository must reject attachments before upload pipeline');
    assert(calls.length === callCountBeforeAttachment, 'Attachment rejection must happen before network request');

    const callCountBeforeModel = calls.length;
    let modelRejected = false;
    try {
      await repository.create({ content: 'С моделью', attachments: [], modelPreference: 'provider:model' });
    } catch (error) {
      modelRejected = error instanceof ServerChatRepositoryError && error.code === 'models_not_ready';
    }
    assert(modelRejected, 'Server repository must reject unavailable model selection');
    assert(calls.length === callCountBeforeModel, 'Model rejection must happen before network request');

    const appended = await repository.appendUserMessage({ conversationId: conversation.id, content: 'Ещё', attachments: [] });
    assert(appended.message.id === 'd'.repeat(32), 'Server repository must parse append mutation');

    const edited = await repository.updateUserMessage({ conversationId: conversation.id, messageId: message.id, content: 'Исправлено' });
    assert(edited.message.editedAt === 3_000, 'Server repository must parse editedAt');

    const renamed = await repository.rename(conversation.id, 'Новое имя');
    assert(renamed.title === 'Новое имя' && renamed.version === 4, 'Server repository must parse rename response');

    await repository.delete(conversation.id);

    const missing = await repository.getPage('f'.repeat(32));
    assert(missing === null, 'Server repository must map conversation 404 to null');

    let invalidRejected = false;
    try {
      await repository.listPage({ cursor: 'broken-server' });
    } catch (error) {
      invalidRejected = error instanceof ServerChatRepositoryError && error.code === 'invalid_response';
    }
    assert(invalidRejected, 'Server repository must reject malformed successful payloads');

    globalThis.fetch = (async () => jsonResponse({ error: { code: 'authentication_required', message: 'Authentication required' } }, 401)) as typeof fetch;
    let authMapped = false;
    try {
      await repository.listPage();
    } catch (error) {
      authMapped = error instanceof ServerChatRepositoryError && error.code === 'authentication_required' && error.status === 401;
    }
    assert(authMapped, 'Server repository must map structured HTTP errors');

    globalThis.fetch = (async () => jsonResponse(
      { error: { code: 'rate_limited', message: 'Too many chat changes' } },
      429,
      { 'Retry-After': '17' },
    )) as typeof fetch;
    let rateMapped = false;
    try {
      await repository.create({ content: 'Слишком быстро', attachments: [] });
    } catch (error) {
      rateMapped = error instanceof ServerChatRepositoryError
        && error.code === 'rate_limited'
        && error.status === 429
        && error.retryAfterSeconds === 17;
    }
    assert(rateMapped, 'Server repository must preserve rate-limit retry metadata');

    globalThis.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    let networkMapped = false;
    try {
      await repository.listPage();
    } catch (error) {
      networkMapped = error instanceof ServerChatRepositoryError && error.code === 'network_error';
    }
    assert(networkMapped, 'Server repository must map network failure without leaking transport error');

    console.log('ARVELIS server conversation repository smoke: PASS');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
