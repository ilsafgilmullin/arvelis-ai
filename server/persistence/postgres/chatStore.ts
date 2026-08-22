import type { Pool, PoolClient } from 'pg';
import type {
  AppendUserMessageInput,
  ChatAttachmentRecord,
  ChatConversationMutationResult,
  ChatConversationRecord,
  ChatConversationSummaryRecord,
  ChatCreateResult,
  ChatDeleteResult,
  ChatMessageMutationResult,
  ChatMessageRecord,
  CreateConversationWithMessageInput,
  ListConversationsInput,
  ListMessagesInput,
  RenameConversationInput,
  ServerConversationStore,
  ServerChatAttachmentKind,
  ServerChatAttachmentStorageState,
  ServerChatMessageRole,
  ServerChatMessageStatus,
  UpdateUserMessageInput,
} from '../../chat/contracts';
import { timestamp } from './rows';

type ConversationRow = {
  id: string;
  account_id: string;
  title: string;
  model_preference: string | null;
  created_at: string | number;
  updated_at: string | number;
  version: string | number;
};

type ConversationSummaryRow = ConversationRow & {
  message_count: string | number;
  latest_message_content: string | null;
  latest_attachment_kind: ServerChatAttachmentKind | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: ServerChatMessageRole;
  status: ServerChatMessageStatus;
  content: string;
  position: number;
  created_at: string | number;
  edited_at: string | number | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  kind: ServerChatAttachmentKind;
  name: string;
  mime_type: string;
  size_bytes: string | number;
  duration_ms: string | number | null;
  storage_state: ServerChatAttachmentStorageState;
  storage_key: string | null;
  created_at: string | number;
};

function safeInteger(value: string | number, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid PostgreSQL integer field: ${field}`);
  return parsed;
}

function conversationFromRow(row: ConversationRow): ChatConversationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    modelPreference: row.model_preference,
    createdAt: timestamp(row.created_at, 'chat_conversation.created_at'),
    updatedAt: timestamp(row.updated_at, 'chat_conversation.updated_at'),
    version: safeInteger(row.version, 'chat_conversation.version'),
  };
}

function summaryFromRow(row: ConversationSummaryRow): ChatConversationSummaryRecord {
  return {
    ...conversationFromRow(row),
    messageCount: safeInteger(row.message_count, 'chat_conversation.message_count'),
    latestMessageContent: row.latest_message_content,
    latestAttachmentKind: row.latest_attachment_kind,
  };
}

function attachmentFromRow(row: AttachmentRow): ChatAttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    kind: row.kind,
    name: row.name,
    mimeType: row.mime_type,
    sizeBytes: safeInteger(row.size_bytes, 'chat_attachment.size_bytes'),
    durationMs: row.duration_ms === null ? null : safeInteger(row.duration_ms, 'chat_attachment.duration_ms'),
    storageState: row.storage_state,
    storageKey: row.storage_key,
    createdAt: timestamp(row.created_at, 'chat_attachment.created_at'),
  };
}

function messageFromRow(row: MessageRow, attachments: ChatAttachmentRecord[] = []): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    status: row.status,
    content: row.content,
    position: row.position,
    createdAt: timestamp(row.created_at, 'chat_message.created_at'),
    editedAt: row.edited_at === null ? null : timestamp(row.edited_at, 'chat_message.edited_at'),
    attachments,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original database failure.
  }
}

async function insertAttachments(client: PoolClient, attachments: readonly ChatAttachmentRecord[]): Promise<void> {
  for (const attachment of attachments) {
    await client.query(`
      INSERT INTO chat_attachments (
        id, message_id, kind, name, mime_type, size_bytes, duration_ms,
        storage_state, storage_key, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      attachment.id,
      attachment.messageId,
      attachment.kind,
      attachment.name,
      attachment.mimeType,
      attachment.sizeBytes,
      attachment.durationMs,
      attachment.storageState,
      attachment.storageKey,
      attachment.createdAt,
    ]);
  }
}

export class PostgresConversationStore implements ServerConversationStore {
  constructor(private readonly pool: Pool) {}

  async listConversations(input: ListConversationsInput): Promise<ChatConversationSummaryRecord[]> {
    const values: unknown[] = [input.accountId];
    let cursorClause = '';
    if (input.before) {
      values.push(input.before.updatedAt, input.before.id);
      cursorClause = 'AND (c.updated_at < $2 OR (c.updated_at = $2 AND c.id < $3))';
    }
    values.push(input.limit);
    const limitIndex = values.length;
    const result = await this.pool.query<ConversationSummaryRow>(`
      SELECT
        c.id, c.account_id, c.title, c.model_preference, c.created_at, c.updated_at, c.version,
        (SELECT COUNT(*) FROM chat_messages count_message WHERE count_message.conversation_id = c.id) AS message_count,
        (SELECT latest_message.content
           FROM chat_messages latest_message
          WHERE latest_message.conversation_id = c.id
          ORDER BY latest_message.position DESC
          LIMIT 1) AS latest_message_content,
        (SELECT latest_attachment.kind
           FROM chat_attachments latest_attachment
           JOIN chat_messages attachment_message ON attachment_message.id = latest_attachment.message_id
          WHERE attachment_message.conversation_id = c.id
          ORDER BY attachment_message.position DESC, latest_attachment.created_at ASC, latest_attachment.id ASC
          LIMIT 1) AS latest_attachment_kind
      FROM chat_conversations c
      WHERE c.account_id = $1 ${cursorClause}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${limitIndex}
    `, values);
    return result.rows.map(summaryFromRow);
  }

  async getConversation(accountId: string, conversationId: string): Promise<ChatConversationRecord | null> {
    const result = await this.pool.query<ConversationRow>(`
      SELECT id, account_id, title, model_preference, created_at, updated_at, version
      FROM chat_conversations
      WHERE id = $1 AND account_id = $2
      LIMIT 1
    `, [conversationId, accountId]);
    const row = result.rows[0];
    return row ? conversationFromRow(row) : null;
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessageRecord[]> {
    const values: unknown[] = [input.accountId, input.conversationId];
    let cursorClause = '';
    if (input.beforePosition !== undefined) {
      values.push(input.beforePosition);
      cursorClause = 'AND m.position < $3';
    }
    values.push(input.limit);
    const limitIndex = values.length;
    const result = await this.pool.query<MessageRow>(`
      SELECT m.id, m.conversation_id, m.role, m.status, m.content, m.position, m.created_at, m.edited_at
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE c.account_id = $1 AND c.id = $2 ${cursorClause}
      ORDER BY m.position DESC
      LIMIT $${limitIndex}
    `, values);
    const rows = [...result.rows].reverse();
    if (!rows.length) return [];

    const attachmentResult = await this.pool.query<AttachmentRow>(`
      SELECT id, message_id, kind, name, mime_type, size_bytes, duration_ms, storage_state, storage_key, created_at
      FROM chat_attachments
      WHERE message_id = ANY($1::text[])
      ORDER BY created_at ASC, id ASC
    `, [rows.map((row) => row.id)]);
    const byMessage = new Map<string, ChatAttachmentRecord[]>();
    for (const row of attachmentResult.rows) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push(attachmentFromRow(row));
      byMessage.set(row.message_id, list);
    }
    return rows.map((row) => messageFromRow(row, byMessage.get(row.id) ?? []));
  }

  async createConversationWithUserMessage(input: CreateConversationWithMessageInput): Promise<ChatCreateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const accountLock = await client.query(
        'SELECT id FROM auth_accounts WHERE id = $1 AND status = \'active\' FOR UPDATE',
        [input.conversation.accountId],
      );
      if (accountLock.rowCount !== 1) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'conflict' };
      }
      const countResult = await client.query<{ count: string | number }>(
        'SELECT COUNT(*) AS count FROM chat_conversations WHERE account_id = $1',
        [input.conversation.accountId],
      );
      const count = safeInteger(countResult.rows[0]?.count ?? 0, 'chat_conversation.count');
      if (count >= input.maxConversations) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'conversation_limit' };
      }

      await client.query(`
        INSERT INTO chat_conversations (
          id, account_id, title, model_preference, created_at, updated_at, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        input.conversation.id,
        input.conversation.accountId,
        input.conversation.title,
        input.conversation.modelPreference,
        input.conversation.createdAt,
        input.conversation.updatedAt,
        input.conversation.version,
      ]);
      await client.query(`
        INSERT INTO chat_messages (
          id, conversation_id, role, status, content, position, created_at, edited_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        input.message.id,
        input.message.conversationId,
        input.message.role,
        input.message.status,
        input.message.content,
        input.message.position,
        input.message.createdAt,
        input.message.editedAt,
      ]);
      await insertAttachments(client, input.message.attachments);
      await client.query('COMMIT');
      return { ok: true, conversation: input.conversation, message: input.message };
    } catch (error) {
      await rollback(client);
      return { ok: false, reason: isUniqueViolation(error) ? 'conflict' : 'unavailable' };
    } finally {
      client.release();
    }
  }

  async appendUserMessage(input: AppendUserMessageInput): Promise<ChatMessageMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const conversationResult = await client.query<ConversationRow>(`
        SELECT id, account_id, title, model_preference, created_at, updated_at, version
        FROM chat_conversations
        WHERE id = $1 AND account_id = $2
        FOR UPDATE
      `, [input.conversationId, input.accountId]);
      const conversationRow = conversationResult.rows[0];
      if (!conversationRow) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }

      const aggregateResult = await client.query<{ count: string | number; max_position: number | null }>(`
        SELECT COUNT(*) AS count, MAX(position) AS max_position
        FROM chat_messages
        WHERE conversation_id = $1
      `, [input.conversationId]);
      const aggregate = aggregateResult.rows[0];
      const count = safeInteger(aggregate?.count ?? 0, 'chat_message.count');
      if (count >= input.maxMessages) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'message_limit' };
      }
      const position = (aggregate?.max_position ?? -1) + 1;
      const message: ChatMessageRecord = { ...input.message, position };
      await client.query(`
        INSERT INTO chat_messages (
          id, conversation_id, role, status, content, position, created_at, edited_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        message.id,
        message.conversationId,
        message.role,
        message.status,
        message.content,
        message.position,
        message.createdAt,
        message.editedAt,
      ]);
      await insertAttachments(client, message.attachments);
      const updatedResult = await client.query<ConversationRow>(`
        UPDATE chat_conversations
        SET updated_at = GREATEST(updated_at, $3), version = version + 1
        WHERE id = $1 AND account_id = $2
        RETURNING id, account_id, title, model_preference, created_at, updated_at, version
      `, [input.conversationId, input.accountId, message.createdAt]);
      const updated = updatedResult.rows[0];
      if (!updated) throw new Error('Conversation disappeared during append');
      await client.query('COMMIT');
      return { ok: true, conversation: conversationFromRow(updated), message };
    } catch (error) {
      await rollback(client);
      return { ok: false, reason: isUniqueViolation(error) ? 'conflict' : 'unavailable' };
    } finally {
      client.release();
    }
  }

  async updateUserMessage(input: UpdateUserMessageInput): Promise<ChatMessageMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const conversationResult = await client.query<ConversationRow>(`
        SELECT id, account_id, title, model_preference, created_at, updated_at, version
        FROM chat_conversations
        WHERE id = $1 AND account_id = $2
        FOR UPDATE
      `, [input.conversationId, input.accountId]);
      if (!conversationResult.rows[0]) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }

      const messageResult = await client.query<MessageRow>(`
        SELECT id, conversation_id, role, status, content, position, created_at, edited_at
        FROM chat_messages
        WHERE id = $1 AND conversation_id = $2 AND role = 'user'
        FOR UPDATE
      `, [input.messageId, input.conversationId]);
      const row = messageResult.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }
      const createdAt = timestamp(row.created_at, 'chat_message.created_at');
      const editedAt = Math.max(input.editedAt, createdAt);
      const updatedMessageResult = await client.query<MessageRow>(`
        UPDATE chat_messages
        SET content = $3, edited_at = $4, status = 'completed'
        WHERE id = $1 AND conversation_id = $2
        RETURNING id, conversation_id, role, status, content, position, created_at, edited_at
      `, [input.messageId, input.conversationId, input.content, editedAt]);
      const updatedMessageRow = updatedMessageResult.rows[0];
      if (!updatedMessageRow) throw new Error('Message disappeared during update');

      const conversationUpdate = await client.query<ConversationRow>(`
        UPDATE chat_conversations
        SET updated_at = GREATEST(updated_at, $3), version = version + 1
        WHERE id = $1 AND account_id = $2
        RETURNING id, account_id, title, model_preference, created_at, updated_at, version
      `, [input.conversationId, input.accountId, editedAt]);
      const updatedConversation = conversationUpdate.rows[0];
      if (!updatedConversation) throw new Error('Conversation disappeared during message update');

      const attachmentResult = await client.query<AttachmentRow>(`
        SELECT id, message_id, kind, name, mime_type, size_bytes, duration_ms, storage_state, storage_key, created_at
        FROM chat_attachments WHERE message_id = $1 ORDER BY created_at ASC, id ASC
      `, [input.messageId]);
      await client.query('COMMIT');
      return {
        ok: true,
        conversation: conversationFromRow(updatedConversation),
        message: messageFromRow(updatedMessageRow, attachmentResult.rows.map(attachmentFromRow)),
      };
    } catch {
      await rollback(client);
      return { ok: false, reason: 'unavailable' };
    } finally {
      client.release();
    }
  }

  async renameConversation(input: RenameConversationInput): Promise<ChatConversationMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ConversationRow>(`
        SELECT id, account_id, title, model_preference, created_at, updated_at, version
        FROM chat_conversations
        WHERE id = $1 AND account_id = $2
        FOR UPDATE
      `, [input.conversationId, input.accountId]);
      const existing = result.rows[0];
      if (!existing) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }
      const updatedAt = Math.max(timestamp(existing.updated_at, 'chat_conversation.updated_at'), input.updatedAt);
      const update = await client.query<ConversationRow>(`
        UPDATE chat_conversations
        SET title = $3, updated_at = $4, version = version + 1
        WHERE id = $1 AND account_id = $2
        RETURNING id, account_id, title, model_preference, created_at, updated_at, version
      `, [input.conversationId, input.accountId, input.title, updatedAt]);
      const updated = update.rows[0];
      if (!updated) throw new Error('Conversation disappeared during rename');
      await client.query('COMMIT');
      return { ok: true, conversation: conversationFromRow(updated) };
    } catch (error) {
      await rollback(client);
      return { ok: false, reason: isUniqueViolation(error) ? 'conflict' : 'unavailable' };
    } finally {
      client.release();
    }
  }

  async deleteConversation(accountId: string, conversationId: string): Promise<ChatDeleteResult> {
    try {
      const result = await this.pool.query(
        'DELETE FROM chat_conversations WHERE id = $1 AND account_id = $2',
        [conversationId, accountId],
      );
      return { ok: true, deleted: result.rowCount === 1 };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
}
