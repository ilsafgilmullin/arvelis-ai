import { ChatApplicationService } from '../server/chat/service';
import { SqliteAccountIdentityStore } from '../server/persistence/sqlite/authStores';
import { SqliteConversationStore } from '../server/persistence/sqlite/chatStore';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');
  try {
    const accounts = new SqliteAccountIdentityStore(database);
    for (const [accountId, identityId, email] of [
      ['account-a', 'identity-a', 'a@example.test'],
      ['account-b', 'identity-b', 'b@example.test'],
    ] as const) {
      const created = await accounts.createAccountWithEmailIdentity({
        accountId,
        identityId,
        displayName: accountId,
        canonicalEmail: email,
        verifiedAt: 1_000,
        createdAt: 1_000,
      });
      assert(created.status === 'created', 'Chat smoke account must be created');
    }

    const store = new SqliteConversationStore(database);
    let clock = 10_000;
    const chat = new ChatApplicationService(store, () => {
      clock += 100;
      return clock;
    });

    const first = await chat.createConversation('account-a', 'Первое сообщение');
    assert(first.ok, 'SQLite Chat must create conversation');
    const firstId = first.conversation.id;
    assert(first.message.position === 0, 'First message position must be zero');

    const foreignRead = await chat.getConversation('account-b', firstId);
    assert(!foreignRead.ok && foreignRead.code === 'not_found', 'Foreign account must not read conversation by id');
    const foreignAppend = await chat.appendUserMessage('account-b', firstId, 'Чужое сообщение');
    assert(!foreignAppend.ok && foreignAppend.code === 'not_found', 'Foreign account must not append to conversation');
    const foreignRename = await chat.renameConversation('account-b', firstId, 'Чужое имя');
    assert(!foreignRename.ok && foreignRename.code === 'not_found', 'Foreign account must not rename conversation');

    const appended = await chat.appendUserMessage('account-a', firstId, 'Второе сообщение');
    assert(appended.ok && appended.message.position === 1, 'Second message must append at position one');
    assert(appended.conversation.version === 2, 'Append must increment conversation version');

    const pageOne = await chat.getConversation('account-a', firstId, { messageLimit: 1 });
    assert(pageOne.ok, 'Conversation page must load');
    assert(pageOne.page.messages.length === 1 && pageOne.page.messages[0]?.position === 1, 'Latest page must return newest message');
    const nextMessageCursor = pageOne.page.nextMessageCursor;
    assert(nextMessageCursor, 'Latest page must expose older-message cursor');
    const pageTwo = await chat.getConversation('account-a', firstId, {
      messageLimit: 1,
      messageCursor: nextMessageCursor,
    });
    assert(pageTwo.ok, 'Older message page must load');
    assert(pageTwo.page.messages[0]?.position === 0, 'Older page must return first message');
    assert(pageTwo.page.nextMessageCursor === null, 'Oldest page must terminate pagination');

    const edited = await chat.updateUserMessage('account-a', firstId, first.message.id, 'Первое сообщение — исправлено');
    assert(edited.ok && edited.message.content.includes('исправлено'), 'Owned user message must be editable');
    assert(edited.message.editedAt !== null, 'Edited user message must record editedAt');

    const foreignEdit = await chat.updateUserMessage('account-b', firstId, first.message.id, 'Подмена');
    assert(!foreignEdit.ok && foreignEdit.code === 'not_found', 'Foreign account must not edit message');

    const renamed = await chat.renameConversation('account-a', firstId, 'Рабочий диалог');
    assert(renamed.ok && renamed.conversation.title === 'Рабочий диалог', 'Owned conversation must be renameable');

    const second = await chat.createConversation('account-a', 'Второй диалог');
    const third = await chat.createConversation('account-a', 'Третий диалог');
    assert(second.ok && third.ok, 'Additional conversations must be created');

    const listOne = await chat.listConversations('account-a', { limit: 2 });
    assert(listOne.ok && listOne.page.items.length === 2, 'Conversation list must honor page size');
    const nextConversationCursor = listOne.page.nextCursor;
    assert(nextConversationCursor, 'Conversation list must return cursor when page is full');
    const listTwo = await chat.listConversations('account-a', { limit: 2, cursor: nextConversationCursor });
    assert(listTwo.ok && listTwo.page.items.length === 1, 'Conversation cursor must return remaining item');
    assert(listTwo.page.nextCursor === null, 'Final conversation page must terminate cursor');

    const foreignList = await chat.listConversations('account-b');
    assert(foreignList.ok && foreignList.page.items.length === 0, 'Account list must not leak other account conversations');

    const directLimit = await store.appendUserMessage({
      accountId: 'account-a',
      conversationId: firstId,
      maxMessages: 2,
      message: {
        id: 'f'.repeat(32),
        conversationId: firstId,
        role: 'user',
        status: 'completed',
        content: 'Должно быть отклонено лимитом',
        createdAt: 30_000,
        editedAt: null,
        attachments: [],
      },
    });
    assert(!directLimit.ok && directLimit.reason === 'message_limit', 'Store must enforce message limit atomically');

    const fakeConversationId = 'e'.repeat(32);
    const fakeMessageId = 'd'.repeat(32);
    const conversationLimit = await store.createConversationWithUserMessage({
      maxConversations: 3,
      conversation: {
        id: fakeConversationId,
        accountId: 'account-a',
        title: 'Лишний диалог',
        modelPreference: null,
        createdAt: 40_000,
        updatedAt: 40_000,
        version: 1,
      },
      message: {
        id: fakeMessageId,
        conversationId: fakeConversationId,
        role: 'user',
        status: 'completed',
        content: 'Лишний',
        position: 0,
        createdAt: 40_000,
        editedAt: null,
        attachments: [],
      },
    });
    assert(!conversationLimit.ok && conversationLimit.reason === 'conversation_limit', 'Store must enforce conversation limit atomically');

    const foreignDelete = await chat.deleteConversation('account-b', firstId);
    assert(foreignDelete.ok && !foreignDelete.deleted, 'Foreign delete must be indistinguishable from missing data');
    const deleted = await chat.deleteConversation('account-a', firstId);
    assert(deleted.ok && deleted.deleted, 'Owner must be able to delete conversation');
    const remainingMessages = database.prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE conversation_id = ?')
      .get(firstId) as { count: number };
    assert(Number(remainingMessages.count) === 0, 'Conversation delete must cascade messages');

    console.log('ARVELIS SQLite chat persistence smoke: PASS');
  } finally {
    database.close();
  }
}

void main();
