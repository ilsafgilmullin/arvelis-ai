import { createServer } from 'node:http';
import { ChatApplicationService } from '../server/chat/service';
import { SqliteAccountIdentityStore } from '../server/persistence/sqlite/authStores';
import { SqliteConversationStore } from '../server/persistence/sqlite/chatStore';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import { handleChatRoute } from '../server/runtime/chatRoutes';
import { sendJson } from '../server/runtime/http';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');
  const accounts = new SqliteAccountIdentityStore(database);
  for (const [accountId, identityId, email] of [
    ['route-account-a', 'route-identity-a', 'route-a@example.test'],
    ['route-account-b', 'route-identity-b', 'route-b@example.test'],
  ] as const) {
    const created = await accounts.createAccountWithEmailIdentity({
      accountId,
      identityId,
      displayName: accountId,
      canonicalEmail: email,
      verifiedAt: 1_000,
      createdAt: 1_000,
    });
    assert(created.status === 'created', 'Route smoke account must be created');
  }

  const chat = new ChatApplicationService(new SqliteConversationStore(database));
  const server = createServer((request, response) => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    void handleChatRoute({
      method,
      url,
      request,
      response,
      chat,
      authenticate: async () => {
        const authorization = request.headers.authorization;
        if (authorization === 'Bearer account-a') return { kind: 'authenticated', accountId: 'route-account-a' };
        if (authorization === 'Bearer account-b') return { kind: 'authenticated', accountId: 'route-account-b' };
        return { kind: 'signed_out' };
      },
    }).then((handled) => {
      if (!handled && !response.headersSent) sendJson(response, 404, { error: { code: 'not_found' } });
    }).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: { code: 'test_failure' } });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Route smoke server did not expose a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  const headersA = { Authorization: 'Bearer account-a', 'Content-Type': 'application/json' };
  const headersB = { Authorization: 'Bearer account-b', 'Content-Type': 'application/json' };

  try {
    const signedOut = await fetch(`${base}/api/chat/conversations`);
    assert(signedOut.status === 401, 'Signed-out Chat route must return 401');

    const create = await fetch(`${base}/api/chat/conversations`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'HTTP smoke message' }),
    });
    assert(create.status === 201, 'Authenticated account must create conversation');
    const createdText = await create.text();
    assert(!createdText.includes('accountId'), 'Public create response must not expose account ownership field');
    assert(!createdText.includes('storageKey'), 'Public create response must not expose storage internals');
    const created = JSON.parse(createdText) as { conversation?: { id?: string }; message?: { id?: string } };
    const conversationId = created.conversation?.id;
    const messageId = created.message?.id;
    assert(typeof conversationId === 'string' && conversationId.length === 32, 'Create route must return conversation id');
    assert(typeof messageId === 'string' && messageId.length === 32, 'Create route must return message id');

    const list = await fetch(`${base}/api/chat/conversations?limit=20`, { headers: headersA });
    assert(list.status === 200, 'Owner must list conversations');
    const listText = await list.text();
    assert(!listText.includes('accountId'), 'Public list must not expose account ownership field');
    const listed = JSON.parse(listText) as { items?: unknown[] };
    assert(listed.items?.length === 1, 'Owner list must include created conversation');

    const foreignGet = await fetch(`${base}/api/chat/conversations/${conversationId}`, { headers: headersB });
    assert(foreignGet.status === 404, 'Foreign account must receive 404 for conversation id');

    const attachmentAttempt = await fetch(`${base}/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'with file', attachments: [{ id: 'fake' }] }),
    });
    assert(attachmentAttempt.status === 409, 'Client attachments must be rejected before server upload pipeline');
    const attachmentError = await attachmentAttempt.json() as { error?: { code?: string } };
    assert(attachmentError.error?.code === 'attachments_not_ready', 'Attachment rejection must be explicit');

    const internalAttachmentId = 'a'.repeat(32);
    database.prepare(`
      INSERT INTO chat_attachments (
        id, message_id, kind, name, mime_type, size_bytes, duration_ms,
        storage_state, storage_key, created_at
      ) VALUES (?, ?, 'file', 'private.txt', 'text/plain', 7, NULL, 'ready', ?, ?)
    `).run(internalAttachmentId, messageId, 'internal/private/storage-key', 2_000);
    const attachmentRead = await fetch(`${base}/api/chat/conversations/${conversationId}`, { headers: headersA });
    assert(attachmentRead.status === 200, 'Owner must read conversation containing stored attachment metadata');
    const attachmentReadText = await attachmentRead.text();
    assert(attachmentReadText.includes(internalAttachmentId), 'Public conversation must include safe attachment metadata');
    assert(attachmentReadText.includes('storageState'), 'Public attachment must expose processing state');
    assert(!attachmentReadText.includes('storageKey'), 'Public attachment must never expose storageKey property');
    assert(!attachmentReadText.includes('internal/private/storage-key'), 'Public attachment must never expose internal storage key value');
    assert(!attachmentReadText.includes('accountId'), 'Public conversation detail must not expose account ownership field');

    const append = await fetch(`${base}/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: headersA,
      body: JSON.stringify({ content: 'Second HTTP message' }),
    });
    assert(append.status === 201, 'Owner must append text message');

    const edit = await fetch(`${base}/api/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: headersA,
      body: JSON.stringify({ content: 'Edited HTTP smoke message' }),
    });
    assert(edit.status === 200, 'Owner must edit own user message');

    const rename = await fetch(`${base}/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: headersA,
      body: JSON.stringify({ title: 'HTTP route smoke' }),
    });
    assert(rename.status === 200, 'Owner must rename conversation');

    const foreignDelete = await fetch(`${base}/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: headersB,
    });
    assert(foreignDelete.status === 204, 'Foreign delete must not reveal ownership');
    const stillThere = await fetch(`${base}/api/chat/conversations/${conversationId}`, { headers: headersA });
    assert(stillThere.status === 200, 'Foreign delete must not remove owner conversation');

    const invalidCursor = await fetch(`${base}/api/chat/conversations?cursor=%%%`, { headers: headersA });
    assert(invalidCursor.status === 400, 'Malformed pagination cursor must be rejected');

    const remove = await fetch(`${base}/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: headersA,
    });
    assert(remove.status === 204, 'Owner delete must return 204');
    const missing = await fetch(`${base}/api/chat/conversations/${conversationId}`, { headers: headersA });
    assert(missing.status === 404, 'Deleted conversation must not be readable');

    console.log('ARVELIS Chat HTTP routes smoke: PASS');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    database.close();
  }
}

void main();
