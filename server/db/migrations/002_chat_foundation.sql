CREATE TABLE IF NOT EXISTS chat_conversations (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  model_preference text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS chat_conversations_account_updated_idx
  ON chat_conversations(account_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'streaming', 'completed', 'failed', 'cancelled')),
  content text NOT NULL CHECK (char_length(content) <= 12000),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL,
  edited_at timestamptz,
  UNIQUE (conversation_id, position),
  CHECK (edited_at IS NULL OR edited_at >= created_at)
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_position_idx
  ON chat_messages(conversation_id, position ASC);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'file')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 240),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 180),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  duration_ms bigint,
  storage_state text NOT NULL CHECK (storage_state IN ('pending', 'ready', 'failed')),
  storage_key text,
  created_at timestamptz NOT NULL,
  CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CHECK ((storage_state = 'ready' AND storage_key IS NOT NULL) OR storage_state <> 'ready')
);

CREATE INDEX IF NOT EXISTS chat_attachments_message_idx
  ON chat_attachments(message_id, created_at ASC, id ASC);
