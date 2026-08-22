import pg from 'pg';
import { ChatApplicationService } from '../server/chat/service';
import { PostgresAccountIdentityStore } from '../server/persistence/postgres/accountIdentityStore';
import { PostgresConversationStore } from '../server/persistence/postgres/chatStore';

const { Pool } = pg;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL chat smoke');

  const pool = new Pool({ connectionString, max: 4, application_name: 'arvelis-chat-db-smoke' });
  try {
    await pool.query(`
      TRUNCATE TABLE
        chat_attachments,
        chat_messages,
        chat_conversations,
        auth_security_events,
        auth_sessions,
        auth_rate_limits,
        auth_email_otp_challenges,
        auth_email_identities,
        auth_accounts
      RESTART IDENTITY CASCADE
    `);

    const accounts = new PostgresAccountIdentityStore(pool);
    for (const [accountId, identityId, email] of [
      ['chat_account_a', 'chat_identity_a', 'chat-a@example.test'],
      ['chat_account_b', 'chat_identity_b', 'chat-b@example.test'],
    ] as const) {
      const created = await accounts.createAccountWithEmailIdentity({
        accountId,
        identityId,
        displayName: accountId,
        canonicalEmail: email,
        verifiedAt: 1_000,
        createdAt: 1_000,
      });
      assert(created.status === 'created', 'PostgreSQL Chat smoke account must be created');
    }

    const store = new PostgresConversationStore(pool);
    let clock = 20_000;
    const chat = new ChatApplicationService(store, () => {
      clock += 100;
      return clock;
    });

    const first = await chat.createConversation('chat_account_a', 'Первый серверный диалог');
    assert(first.ok, 'PostgreSQL Chat must create conversation');
    const firstId = first.conversation.id;

    const appended = await chat.appendUserMessage('chat_account_a', firstId, 'Второе сообщение');
    assert(appended.ok && appended.message.position === 1, 'PostgreSQL Chat must append sequential message');
    assert(appended.conversation.version === 2, 'Append must increment PostgreSQL conversation version');

    const foreignRead = await chat.getConversation('chat_account_b', firstId);
    assert(!foreignRead.ok && foreignRead.code === 'not_found', 'PostgreSQL Chat must enforce read ownership');
    const foreignEdit = await chat.updateUserMessage('chat_account_b', firstId, first.message.id, 'Подмена');
    assert(!foreignEdit.ok && foreignEdit.code === 'not_found', 'PostgreSQL Chat must enforce edit ownership');
    const foreignDelete = await chat.deleteConversation('chat_account_b', firstId);
    assert(foreignDelete.ok && !foreignDelete.deleted, 'PostgreSQL Chat must not expose foreign delete target');

    const edited = await chat.updateUserMessage('chat_account_a', firstId, first.message.id, 'Первый серверный диалог — исправлено');
    assert(edited.ok && edited.message.editedAt !== null, 'PostgreSQL Chat must persist message edit');

    const renamed = await chat.renameConversation('chat_account_a', firstId, 'Серверный диалог');
    assert(renamed.ok && renamed.conversation.title === 'Серверный диалог', 'PostgreSQL Chat must persist rename');

    const firstPage = await chat.getConversation('chat_account_a', firstId, { messageLimit: 1 });
    assert(firstPage.ok && firstPage.page.messages[0]?.position === 1, 'PostgreSQL message page must start with latest message');
    const nextMessageCursor = firstPage.page.nextMessageCursor;
    assert(nextMessageCursor, 'PostgreSQL message page must expose cursor');
    const olderPage = await chat.getConversation('chat_account_a', firstId, {
      messageLimit: 1,
      messageCursor: nextMessageCursor,
    });
    assert(olderPage.ok && olderPage.page.messages[0]?.position === 0, 'PostgreSQL message cursor must load older message');

    const second = await chat.createConversation('chat_account_a', 'Второй серверный диалог');
    const third = await chat.createConversation('chat_account_a', 'Третий серверный диалог');
    assert(second.ok && third.ok, 'PostgreSQL Chat must create additional conversations');
    const listOne = await chat.listConversations('chat_account_a', { limit: 2 });
    assert(listOne.ok && listOne.page.items.length === 2, 'PostgreSQL conversation page size must be enforced');
    const nextConversationCursor = listOne.page.nextCursor;
    assert(nextConversationCursor, 'PostgreSQL conversation page must expose cursor');
    const listTwo = await chat.listConversations('chat_account_a', { limit: 2, cursor: nextConversationCursor });
    assert(listTwo.ok && listTwo.page.items.length === 1, 'PostgreSQL conversation cursor must load remaining conversation');

    const directMessageLimit = await store.appendUserMessage({
      accountId: 'chat_account_a',
      conversationId: firstId,
      maxMessages: 2,
      message: {
        id: 'f'.repeat(32),
        conversationId: firstId,
        role: 'user',
        status: 'completed',
        content: 'Не должно сохраниться',
        createdAt: 50_000,
        editedAt: null,
        attachments: [],
      },
    });
    assert(!directMessageLimit.ok && directMessageLimit.reason === 'message_limit', 'PostgreSQL store must enforce message limit atomically');

    const limitConversationId = 'e'.repeat(32);
    const directConversationLimit = await store.createConversationWithUserMessage({
      maxConversations: 3,
      conversation: {
        id: limitConversationId,
        accountId: 'chat_account_a',
        title: 'Лишний диалог',
        modelPreference: null,
        createdAt: 60_000,
        updatedAt: 60_000,
        version: 1,
      },
      message: {
        id: 'd'.repeat(32),
        conversationId: limitConversationId,
        role: 'user',
        status: 'completed',
        content: 'Лишний',
        position: 0,
        createdAt: 60_000,
        editedAt: null,
        attachments: [],
      },
    });
    assert(!directConversationLimit.ok && directConversationLimit.reason === 'conversation_limit', 'PostgreSQL store must enforce conversation limit atomically');

    const deleted = await chat.deleteConversation('chat_account_a', firstId);
    assert(deleted.ok && deleted.deleted, 'PostgreSQL owner must delete conversation');
    const orphanCount = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM chat_messages WHERE conversation_id = $1', [firstId]);
    assert(Number(orphanCount.rows[0]?.count ?? -1) === 0, 'PostgreSQL delete must cascade messages');

    console.log('ARVELIS PostgreSQL chat persistence smoke: PASS');
  } finally {
    await pool.end();
  }
}

void main();
