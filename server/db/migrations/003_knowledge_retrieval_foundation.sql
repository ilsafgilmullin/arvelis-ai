CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_sources (
  namespace_kind text NOT NULL,
  namespace_key text NOT NULL,
  account_id text REFERENCES auth_accounts(id) ON DELETE RESTRICT,
  id text NOT NULL,
  title text NOT NULL,
  publisher text NOT NULL,
  source_type text NOT NULL,
  rights_status text NOT NULL,
  source_status text NOT NULL,
  jurisdiction text NOT NULL,
  language text NOT NULL,
  canonical_url text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (namespace_kind, namespace_key, id),
  CONSTRAINT knowledge_sources_namespace CHECK (
    (namespace_kind = 'global' AND namespace_key = 'global' AND account_id IS NULL)
    OR
    (namespace_kind = 'account' AND account_id IS NOT NULL AND namespace_key = account_id)
  ),
  CONSTRAINT knowledge_sources_id CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT knowledge_sources_title CHECK (char_length(title) BETWEEN 1 AND 240 AND title = btrim(title)),
  CONSTRAINT knowledge_sources_publisher CHECK (char_length(publisher) BETWEEN 1 AND 160 AND publisher = btrim(publisher)),
  CONSTRAINT knowledge_sources_type CHECK (source_type IN ('official', 'editorial', 'user')),
  CONSTRAINT knowledge_sources_rights CHECK (rights_status IN ('public', 'licensed', 'user_owned', 'restricted', 'unknown')),
  CONSTRAINT knowledge_sources_status CHECK (source_status IN ('pending', 'active', 'disabled', 'revoked')),
  CONSTRAINT knowledge_sources_global_origin CHECK (namespace_kind <> 'global' OR (source_type <> 'user' AND rights_status <> 'user_owned')),
  CONSTRAINT knowledge_sources_jurisdiction CHECK (jurisdiction ~ '^(GLOBAL|[A-Z0-9][A-Z0-9._:-]{1,31})$'),
  CONSTRAINT knowledge_sources_language CHECK (language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
  CONSTRAINT knowledge_sources_url CHECK (canonical_url IS NULL OR canonical_url ~ '^https://'),
  CONSTRAINT knowledge_sources_timestamps CHECK (updated_at >= created_at)
);

CREATE INDEX knowledge_sources_lookup_idx
  ON knowledge_sources(namespace_kind, namespace_key, source_status, language, jurisdiction);

CREATE TABLE knowledge_documents (
  namespace_kind text NOT NULL,
  namespace_key text NOT NULL,
  id text NOT NULL,
  source_id text NOT NULL,
  external_key text,
  title text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (namespace_kind, namespace_key, id),
  UNIQUE (namespace_kind, namespace_key, id, source_id),
  FOREIGN KEY (namespace_kind, namespace_key, source_id)
    REFERENCES knowledge_sources(namespace_kind, namespace_key, id) ON DELETE RESTRICT,
  CONSTRAINT knowledge_documents_id CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT knowledge_documents_source_id CHECK (source_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT knowledge_documents_external_key CHECK (external_key IS NULL OR (char_length(external_key) BETWEEN 1 AND 512 AND external_key = btrim(external_key))),
  CONSTRAINT knowledge_documents_title CHECK (char_length(title) BETWEEN 1 AND 300 AND title = btrim(title)),
  CONSTRAINT knowledge_documents_timestamps CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX knowledge_documents_external_key_idx
  ON knowledge_documents(namespace_kind, namespace_key, source_id, external_key)
  WHERE external_key IS NOT NULL;

CREATE TABLE knowledge_document_versions (
  namespace_kind text NOT NULL,
  namespace_key text NOT NULL,
  id text NOT NULL,
  source_id text NOT NULL,
  document_id text NOT NULL,
  content_hash char(64) NOT NULL,
  byte_length integer NOT NULL,
  version_status text NOT NULL,
  fetched_at timestamptz,
  verified_at timestamptz,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (namespace_kind, namespace_key, id),
  UNIQUE (namespace_kind, namespace_key, id, document_id, source_id),
  UNIQUE (namespace_kind, namespace_key, document_id, content_hash),
  FOREIGN KEY (namespace_kind, namespace_key, document_id, source_id)
    REFERENCES knowledge_documents(namespace_kind, namespace_key, id, source_id) ON DELETE RESTRICT,
  CONSTRAINT knowledge_document_versions_id CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT knowledge_document_versions_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT knowledge_document_versions_size CHECK (byte_length BETWEEN 1 AND 20000000),
  CONSTRAINT knowledge_document_versions_status CHECK (version_status IN ('processing', 'ready', 'failed', 'superseded', 'quarantined')),
  CONSTRAINT knowledge_document_versions_verify_time CHECK (verified_at IS NULL OR fetched_at IS NULL OR verified_at >= fetched_at),
  CONSTRAINT knowledge_document_versions_effective_time CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE INDEX knowledge_document_versions_filter_idx
  ON knowledge_document_versions(namespace_kind, namespace_key, version_status, effective_until, verified_at);

CREATE TABLE knowledge_chunks (
  namespace_kind text NOT NULL,
  namespace_key text NOT NULL,
  id text NOT NULL,
  source_id text NOT NULL,
  document_id text NOT NULL,
  document_version_id text NOT NULL,
  ordinal integer NOT NULL,
  domain text NOT NULL,
  jurisdiction text NOT NULL,
  language text NOT NULL,
  chunk_text text NOT NULL,
  content_hash char(64) NOT NULL,
  embedding_status text NOT NULL,
  embedding_model_id text,
  embedding vector(1024),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (namespace_kind, namespace_key, id),
  UNIQUE (namespace_kind, namespace_key, document_version_id, ordinal),
  FOREIGN KEY (namespace_kind, namespace_key, document_version_id, document_id, source_id)
    REFERENCES knowledge_document_versions(namespace_kind, namespace_key, id, document_id, source_id) ON DELETE RESTRICT,
  CONSTRAINT knowledge_chunks_id CHECK (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT knowledge_chunks_ordinal CHECK (ordinal BETWEEN 0 AND 100000),
  CONSTRAINT knowledge_chunks_domain CHECK (domain IN ('trip', 'destination', 'itinerary', 'transport_schedule', 'price', 'availability', 'map_route', 'legal', 'weather', 'general')),
  CONSTRAINT knowledge_chunks_jurisdiction CHECK (jurisdiction ~ '^(GLOBAL|[A-Z0-9][A-Z0-9._:-]{1,31})$'),
  CONSTRAINT knowledge_chunks_language CHECK (language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
  CONSTRAINT knowledge_chunks_text CHECK (char_length(chunk_text) BETWEEN 1 AND 4000 AND chunk_text = btrim(chunk_text)),
  CONSTRAINT knowledge_chunks_hash CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT knowledge_chunks_embedding_status CHECK (embedding_status IN ('pending', 'ready', 'failed', 'disabled')),
  CONSTRAINT knowledge_chunks_embedding_state CHECK (
    (embedding_status = 'ready' AND embedding IS NOT NULL AND embedding_model_id IS NOT NULL AND char_length(embedding_model_id) BETWEEN 1 AND 160)
    OR
    (embedding_status <> 'ready' AND embedding IS NULL AND (embedding_model_id IS NULL OR char_length(embedding_model_id) BETWEEN 1 AND 160))
  )
);

CREATE INDEX knowledge_chunks_filter_idx
  ON knowledge_chunks(namespace_kind, namespace_key, embedding_status, language, jurisdiction, domain);
