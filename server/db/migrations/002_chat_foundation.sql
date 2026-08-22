CREATE TABLE IF NOT EXISTS chat_conversations (
  id char(32) PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  title text NOT NULL,
  model_preference text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT chat_conversations_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT chat_conversations_title_length CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT chat_conversations_title_trimmed CHECK (title = btrim(title)),
  CONSTRAINT chat_conversations_model_preference_length CHECK (
    model_preference IS NULL OR char_length(model_preference) BETWEEN 1 AND 160
  ),
  CONSTRAINT chat_conversations_timestamps CHECK (created_at >= 0 AND updated_at >= created_at),
  CONSTRAINT chat_conversations_version CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS chat_conversations_account_updated_idx
  ON chat_conversations(account_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id char(32) PRIMARY KEY,
  conversation_id char(32) NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL,
  content text NOT NULL,
  position integer NOT NULL,
  created_at bigint NOT NULL,
  edited_at bigint,
  CONSTRAINT chat_messages_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT chat_messages_role CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT chat_messages_status CHECK (status IN ('pending', 'sending', 'streaming', 'completed', 'failed', 'cancelled')),
  CONSTRAINT chat_messages_content_length CHECK (char_length(content) <= 12000),
  CONSTRAINT chat_messages_position CHECK (position >= 0),
  CONSTRAINT chat_messages_timestamps CHECK (
    created_at >= 0 AND (edited_at IS NULL OR edited_at >= created_at)
  ),
  UNIQUE (conversation_id, position)
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_position_idx
  ON chat_messages(conversation_id, position ASC);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id char(32) PRIMARY KEY,
  message_id char(32) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_ms bigint,
  storage_state text NOT NULL,
  storage_key text,
  created_at bigint NOT NULL,
  CONSTRAINT chat_attachments_id_format CHECK (id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT chat_attachments_kind CHECK (kind IN ('image', 'video', 'audio', 'file')),
  CONSTRAINT chat_attachments_name_length CHECK (char_length(name) BETWEEN 1 AND 240),
  CONSTRAINT chat_attachments_mime_type_length CHECK (char_length(mime_type) BETWEEN 1 AND 180),
  CONSTRAINT chat_attachments_size CHECK (size_bytes >= 0),
  CONSTRAINT chat_attachments_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT chat_attachments_storage_state CHECK (storage_state IN ('pending', 'ready', 'failed')),
  CONSTRAINT chat_attachments_storage_key_length CHECK (
    storage_key IS NULL OR char_length(storage_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT chat_attachments_ready_key CHECK (
    (storage_state = 'ready' AND storage_key IS NOT NULL)
    OR (storage_state <> 'ready' AND storage_key IS NULL)
  ),
  CONSTRAINT chat_attachments_created_at CHECK (created_at >= 0)
);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON chat_attachments(message_id, created_at ASC, id ASC);
