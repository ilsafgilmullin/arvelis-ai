import type { DatabaseSync, StatementSync } from 'node:sqlite';
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
import { inSqliteTransaction } from './database';

type ConversationRow = {
  id: string;
  account_id: string;
  title: string;
  model_preference: string | null;
  created_at: number;
  updated_at: number;
  version: number;
};

type ConversationSummaryRow = ConversationRow & {
  message_count: number;
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
  created_at: number;
  edited_at: number | null;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  kind: ServerChatAttachmentKind;
  name: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  storage_state: ServerChatAttachmentStorageState;
  storage_key: string | null;
  created_at: number;
};

function conversationFromRow(row: ConversationRow): ChatConversationRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    modelPreference: row.model_preference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function summaryFromRow(row: ConversationSummaryRow): ChatConversationSummaryRecord {
  return {
    ...conversationFromRow(row),
    messageCount: Number(row.message_count),
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
    sizeBytes: Number(row.size_bytes),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    storageState: row.storage_state,
    storageKey: row.storage_key,
    createdAt: Number(row.created_at),
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
    createdAt: row.created_at,
    editedAt: row.edited_at,
    attachments,
  };
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique/i.test(error.message);
}

function insertAttachment(statement: StatementSync, attachment: ChatAttachmentRecord): void {
  statement.run(
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
  );
}

export class SqliteConversationStore implements ServerConversationStore {
  private readonly insertAttachmentStatement: StatementSync;

  constructor(private readonly database: DatabaseSync) {
    this.insertAttachmentStatement = database.prepare(`
      INSERT INTO chat_attachments (
        id, message_id, kind, name, mime_type, size_bytes, duration_ms,
        storage_state, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  async listConversations(input: ListConversationsInput): Promise<ChatConversationSummaryRecord[]> {
    const cursorClause = input.before
      ? 'AND (c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))'
      : '';
    const statement = this.database.prepare(`
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
      WHERE c.account_id = ? ${cursorClause}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?
    `);
    const rows = input.before
      ? statement.all(input.accountId, input.before.updatedAt, input.before.updatedAt, input.before.id, input.limit)
      : statement.all(input.accountId, input.limit);
    return (rows as ConversationSummaryRow[]).map(summaryFromRow);
  }

  async getConversation(accountId: string, conversationId: string): Promise<ChatConversationRecord | null> {
    const row = this.database.prepare(`
      SELECT id, account_id, title, model_preference, created_at, updated_at, version
      FROM chat_conversations
      WHERE id = ? AND account_id = ?
    `).get(conversationId, accountId) as ConversationRow | undefined;
    return row ? conversationFromRow(row) : null;
  }

  async listMessages(input: ListMessagesInput): Promise<ChatMessageRecord[]> {
    const cursorClause = input.beforePosition === undefined ? '' : 'AND m.position < ?';
    const statement = this.database.prepare(`
      SELECT m.id, m.conversation_id, m.role, m.status, m.content, m.position, m.created_at, m.edited_at
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE c.account_id = ? AND c.id = ? ${cursorClause}
      ORDER BY m.position DESC
      LIMIT ?
    `);
    const descendingRows = input.beforePosition === undefined
      ? statement.all(input.accountId, input.conversationId, input.limit)
      : statement.all(input.accountId, input.conversationId, input.beforePosition, input.limit);
    const rows = (descendingRows as MessageRow[]).reverse();
    if (!rows.length) return [];

    const messageIds = rows.map((row) => row.id);
    const placeholders = messageIds.map(() => '?').join(', ');
    const attachmentRows = this.database.prepare(`
      SELECT id, message_id, kind, name, mime_type, size_bytes, duration_ms, storage_state, storage_key, created_at
      FROM chat_attachments
      WHERE message_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
    `).all(...messageIds) as AttachmentRow[];
    const byMessage = new Map<string, ChatAttachmentRecord[]>();
    for (const row of attachmentRows) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push(attachmentFromRow(row));
      byMessage.set(row.message_id, list);
    }

    return rows.map((row) => messageFromRow(row, byMessage.get(row.id) ?? []));
  }

  async createConversationWithUserMessage(input: CreateConversationWithMessageInput): Promise<ChatCreateResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const countRow = this.database.prepare(
          'SELECT COUNT(*) AS count FROM chat_conversations WHERE account_id = ?',
        ).get(input.conversation.accountId) as { count: number };
        if (Number(countRow.count) >= input.maxConversations) return { ok: false as const, reason: 'conversation_limit' as const };

        this.database.prepare(`
          INSERT INTO chat_conversations (
            id, account_id, title, model_preference, created_at, updated_at, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.conversation.id,
          input.conversation.accountId,
          input.conversation.title,
          input.conversation.modelPreference,
          input.conversation.createdAt,
          input.conversation.updatedAt,
          input.conversation.version,
        );
        this.database.prepare(`
          INSERT INTO chat_messages (
            id, conversation_id, role, status, content, position, created_at, edited_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.message.id,
          input.message.conversationId,
          input.message.role,
          input.message.status,
          input.message.content,
          input.message.position,
          input.message.createdAt,
          input.message.editedAt,
        );
        for (const attachment of input.message.attachments) insertAttachment(this.insertAttachmentStatement, attachment);
        return { ok: true as const, conversation: input.conversation, message: input.message };
      });
    } catch (error) {
      return { ok: false, reason: isConstraintError(error) ? 'conflict' : 'unavailable' };
    }
  }

  async appendUserMessage(input: AppendUserMessageInput): Promise<ChatMessageMutationResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const conversationRow = this.database.prepare(`
          SELECT id, account_id, title, model_preference, created_at, updated_at, version
          FROM chat_conversations
          WHERE id = ? AND account_id = ?
        `).get(input.conversationId, input.accountId) as ConversationRow | undefined;
        if (!conversationRow) return { ok: false as const, reason: 'not_found' as const };

        const aggregate = this.database.prepare(`
          SELECT COUNT(*) AS count, COALESCE(MAX(position), -1) AS max_position
          FROM chat_messages
          WHERE conversation_id = ?
        `).get(input.conversationId) as { count: number; max_position: number };
        if (Number(aggregate.count) >= input.maxMessages) return { ok: false as const, reason: 'message_limit' as const };

        const position = Number(aggregate.max_position) + 1;
        const message: ChatMessageRecord = { ...input.message, position };
        this.database.prepare(`
          INSERT INTO chat_messages (
            id, conversation_id, role, status, content, position, created_at, edited_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          message.id,
          message.conversationId,
          message.role,
          message.status,
          message.content,
          message.position,
          message.createdAt,
          message.editedAt,
        );
        for (const attachment of message.attachments) insertAttachment(this.insertAttachmentStatement, attachment);

        const updatedAt = Math.max(conversationRow.updated_at, message.createdAt);
        this.database.prepare(`
          UPDATE chat_conversations
          SET updated_at = ?, version = version + 1
          WHERE id = ? AND account_id = ?
        `).run(updatedAt, input.conversationId, input.accountId);
        const conversation: ChatConversationRecord = {
          ...conversationFromRow(conversationRow),
          updatedAt,
          version: conversationRow.version + 1,
        };
        return { ok: true as const, conversation, message };
      });
    } catch (error) {
      return { ok: false, reason: isConstraintError(error) ? 'conflict' : 'unavailable' };
    }
  }

  async updateUserMessage(input: UpdateUserMessageInput): Promise<ChatMessageMutationResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const row = this.database.prepare(`
          SELECT m.id, m.conversation_id, m.role, m.status, m.content, m.position, m.created_at, m.edited_at
          FROM chat_messages m
          JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE c.account_id = ? AND c.id = ? AND m.id = ? AND m.role = 'user'
        `).get(input.accountId, input.conversationId, input.messageId) as MessageRow | undefined;
        if (!row) return { ok: false as const, reason: 'not_found' as const };

        const editedAt = Math.max(input.editedAt, row.created_at);
        this.database.prepare(`
          UPDATE chat_messages
          SET content = ?, edited_at = ?, status = 'completed'
          WHERE id = ? AND conversation_id = ?
        `).run(input.content, editedAt, input.messageId, input.conversationId);
        this.database.prepare(`
          UPDATE chat_conversations
          SET updated_at = MAX(updated_at, ?), version = version + 1
          WHERE id = ? AND account_id = ?
        `).run(editedAt, input.conversationId, input.accountId);

        const conversationRow = this.database.prepare(`
          SELECT id, account_id, title, model_preference, created_at, updated_at, version
          FROM chat_conversations WHERE id = ? AND account_id = ?
        `).get(input.conversationId, input.accountId) as ConversationRow;
        const attachmentRows = this.database.prepare(`
          SELECT id, message_id, kind, name, mime_type, size_bytes, duration_ms, storage_state, storage_key, created_at
          FROM chat_attachments WHERE message_id = ? ORDER BY created_at ASC, id ASC
        `).all(input.messageId) as AttachmentRow[];
        const message = messageFromRow(
          { ...row, content: input.content, status: 'completed', edited_at: editedAt },
          attachmentRows.map(attachmentFromRow),
        );
        return { ok: true as const, conversation: conversationFromRow(conversationRow), message };
      });
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }

  async renameConversation(input: RenameConversationInput): Promise<ChatConversationMutationResult> {
    try {
      return inSqliteTransaction(this.database, () => {
        const existing = this.database.prepare(`
          SELECT id, account_id, title, model_preference, created_at, updated_at, version
          FROM chat_conversations WHERE id = ? AND account_id = ?
        `).get(input.conversationId, input.accountId) as ConversationRow | undefined;
        if (!existing) return { ok: false as const, reason: 'not_found' as const };
        const updatedAt = Math.max(existing.updated_at, input.updatedAt);
        this.database.prepare(`
          UPDATE chat_conversations
          SET title = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND account_id = ?
        `).run(input.title, updatedAt, input.conversationId, input.accountId);
        return {
          ok: true as const,
          conversation: {
            ...conversationFromRow(existing),
            title: input.title,
            updatedAt,
            version: existing.version + 1,
          },
        };
      });
    } catch (error) {
      return { ok: false, reason: isConstraintError(error) ? 'conflict' : 'unavailable' };
    }
  }

  async deleteConversation(accountId: string, conversationId: string): Promise<ChatDeleteResult> {
    try {
      const result = this.database.prepare(
        'DELETE FROM chat_conversations WHERE id = ? AND account_id = ?',
      ).run(conversationId, accountId);
      return { ok: true, deleted: Number(result.changes) > 0 };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
}
