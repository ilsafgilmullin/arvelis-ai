import type { Pool, PoolClient } from 'pg';
import {
  knowledgeNamespaceKey,
  knowledgeNamespacesEqual,
  validateEmbeddingVector,
  validateKnowledgeChunk,
  validateKnowledgeDocument,
  validateKnowledgeDocumentVersion,
  validateKnowledgeNamespace,
  validateKnowledgeSearchRequest,
  validateKnowledgeSource,
  type KnowledgeDocument,
  type KnowledgeDocumentVersion,
  type KnowledgeIngestionChunk,
  type KnowledgeNamespace,
  type KnowledgeRegistrySource,
  type KnowledgeSearchHit,
  type KnowledgeSearchRequest,
} from '../../../src/travel/knowledgeIngestionContracts';
import type {
  KnowledgeRepository,
  KnowledgeSaveVersionResult,
  KnowledgeVersionBundle,
} from '../../travel/knowledgeRepository';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function namespaceColumns(namespace: KnowledgeNamespace): { kind: 'global' | 'account'; key: string; accountId: string | null } {
  return {
    kind: namespace.kind,
    key: knowledgeNamespaceKey(namespace),
    accountId: namespace.kind === 'account' ? namespace.accountId : null,
  };
}

function vectorLiteral(vector: number[]): string {
  if (validateEmbeddingVector(vector).length > 0) throw new Error('Invalid Knowledge embedding vector');
  return `[${vector.map((value) => Number(value).toString()).join(',')}]`;
}

function iso(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  throw new Error('Invalid persisted Knowledge timestamp');
}

function optionalIso(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : iso(value);
}

type VersionRow = {
  namespace_kind: 'global' | 'account';
  namespace_key: string;
  id: string;
  source_id: string;
  document_id: string;
  content_hash: string;
  byte_length: number;
  version_status: KnowledgeDocumentVersion['status'];
  fetched_at: unknown;
  verified_at: unknown;
  effective_from: unknown;
  effective_until: unknown;
  created_at: unknown;
};

function namespaceFromRow(kind: 'global' | 'account', key: string): KnowledgeNamespace {
  return kind === 'global' ? { kind: 'global' } : { kind: 'account', accountId: key };
}

function versionFromRow(row: VersionRow): KnowledgeDocumentVersion {
  const version: KnowledgeDocumentVersion = {
    version: 1,
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    namespace: namespaceFromRow(row.namespace_kind, row.namespace_key),
    contentHash: row.content_hash,
    byteLength: Number(row.byte_length),
    status: row.version_status,
    ...(optionalIso(row.fetched_at) !== undefined ? { fetchedAt: optionalIso(row.fetched_at)! } : {}),
    ...(optionalIso(row.verified_at) !== undefined ? { verifiedAt: optionalIso(row.verified_at)! } : {}),
    ...(optionalIso(row.effective_from) !== undefined ? { effectiveFrom: optionalIso(row.effective_from)! } : {}),
    ...(optionalIso(row.effective_until) !== undefined ? { effectiveUntil: optionalIso(row.effective_until)! } : {}),
    createdAt: iso(row.created_at),
  };
  if (validateKnowledgeDocumentVersion(version).length > 0) throw new Error('Invalid persisted Knowledge document version');
  return version;
}

type SearchRow = VersionRow & {
  source_title: string;
  source_publisher: string;
  source_type: KnowledgeRegistrySource['sourceType'];
  rights_status: KnowledgeRegistrySource['rights'];
  source_status: KnowledgeRegistrySource['status'];
  source_jurisdiction: string;
  source_language: string;
  canonical_url: string | null;
  source_created_at: unknown;
  source_updated_at: unknown;
  document_title: string;
  external_key: string | null;
  document_created_at: unknown;
  document_updated_at: unknown;
  chunk_id: string;
  ordinal: number;
  domain: KnowledgeIngestionChunk['domain'];
  chunk_jurisdiction: string;
  chunk_language: string;
  chunk_text: string;
  chunk_content_hash: string;
  embedding_status: KnowledgeIngestionChunk['embeddingStatus'];
  embedding_model_id: string | null;
  chunk_created_at: unknown;
  similarity: number | string;
};

function searchHitFromRow(row: SearchRow): KnowledgeSearchHit {
  const namespace = namespaceFromRow(row.namespace_kind, row.namespace_key);
  const source: KnowledgeRegistrySource = {
    version: 1,
    id: row.source_id,
    namespace,
    title: row.source_title,
    publisher: row.source_publisher,
    sourceType: row.source_type,
    rights: row.rights_status,
    status: row.source_status,
    jurisdiction: row.source_jurisdiction,
    language: row.source_language,
    ...(row.canonical_url !== null ? { canonicalUrl: row.canonical_url } : {}),
    createdAt: iso(row.source_created_at),
    updatedAt: iso(row.source_updated_at),
  };
  const document: KnowledgeDocument = {
    version: 1,
    id: row.document_id,
    sourceId: row.source_id,
    namespace,
    ...(row.external_key !== null ? { externalKey: row.external_key } : {}),
    title: row.document_title,
    createdAt: iso(row.document_created_at),
    updatedAt: iso(row.document_updated_at),
  };
  const documentVersion = versionFromRow(row);
  const chunk: KnowledgeIngestionChunk = {
    version: 1,
    id: row.chunk_id,
    sourceId: row.source_id,
    documentId: row.document_id,
    documentVersionId: row.id,
    namespace,
    ordinal: Number(row.ordinal),
    domain: row.domain,
    jurisdiction: row.chunk_jurisdiction,
    language: row.chunk_language,
    text: row.chunk_text,
    contentHash: row.chunk_content_hash,
    embeddingStatus: row.embedding_status,
    ...(row.embedding_model_id !== null ? { embeddingModelId: row.embedding_model_id } : {}),
    createdAt: iso(row.chunk_created_at),
  };
  if (validateKnowledgeSource(source).length > 0 || validateKnowledgeDocument(document).length > 0 || validateKnowledgeChunk(chunk).length > 0) {
    throw new Error('Invalid persisted Knowledge search result');
  }
  const similarity = Number(row.similarity);
  if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) throw new Error('Invalid persisted Knowledge similarity');
  return { source, document, documentVersion, chunk, similarity };
}

async function selectVersionByHash(
  client: Pool | PoolClient,
  namespace: KnowledgeNamespace,
  documentId: string,
  contentHash: string,
): Promise<KnowledgeDocumentVersion | null> {
  const ns = namespaceColumns(namespace);
  const result = await client.query<VersionRow>(`
    SELECT namespace_kind, namespace_key, id, source_id, document_id, content_hash,
           byte_length, version_status, fetched_at, verified_at, effective_from,
           effective_until, created_at
    FROM knowledge_document_versions
    WHERE namespace_kind = $1 AND namespace_key = $2 AND document_id = $3 AND content_hash = $4
    LIMIT 1
  `, [ns.kind, ns.key, documentId, contentHash]);
  const row = result.rows[0];
  return row ? versionFromRow(row) : null;
}

export class PostgresKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly pool: Pool) {}

  async registerSource(source: KnowledgeRegistrySource): Promise<void> {
    const errors = validateKnowledgeSource(source);
    if (errors.length > 0) throw new Error(`Invalid Knowledge source: ${errors.map((item) => `${item.path}:${item.code}`).join(',')}`);
    const ns = namespaceColumns(source.namespace);
    await this.pool.query(`
      INSERT INTO knowledge_sources (
        namespace_kind, namespace_key, account_id, id, title, publisher, source_type,
        rights_status, source_status, jurisdiction, language, canonical_url, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT(namespace_kind, namespace_key, id) DO UPDATE SET
        title = EXCLUDED.title,
        publisher = EXCLUDED.publisher,
        source_type = EXCLUDED.source_type,
        rights_status = EXCLUDED.rights_status,
        source_status = EXCLUDED.source_status,
        jurisdiction = EXCLUDED.jurisdiction,
        language = EXCLUDED.language,
        canonical_url = EXCLUDED.canonical_url,
        updated_at = EXCLUDED.updated_at
    `, [
      ns.kind,
      ns.key,
      ns.accountId,
      source.id,
      source.title,
      source.publisher,
      source.sourceType,
      source.rights,
      source.status,
      source.jurisdiction,
      source.language,
      source.canonicalUrl ?? null,
      source.createdAt,
      source.updatedAt,
    ]);
  }

  async findVersionByContentHash(namespace: KnowledgeNamespace, documentId: string, contentHash: string): Promise<KnowledgeDocumentVersion | null> {
    if (validateKnowledgeNamespace(namespace).length > 0 || !SAFE_ID.test(documentId) || !SHA256.test(contentHash)) {
      throw new Error('Invalid Knowledge deduplication lookup');
    }
    return selectVersionByHash(this.pool, namespace, documentId, contentHash);
  }

  async saveVersion(bundle: KnowledgeVersionBundle): Promise<KnowledgeSaveVersionResult> {
    const sourceErrors = validateKnowledgeSource(bundle.source);
    const documentErrors = validateKnowledgeDocument(bundle.document);
    const versionErrors = validateKnowledgeDocumentVersion(bundle.documentVersion);
    if (sourceErrors.length > 0 || documentErrors.length > 0 || versionErrors.length > 0 || bundle.chunks.length < 1) {
      throw new Error('Invalid Knowledge version bundle');
    }
    const namespace = bundle.source.namespace;
    if (
      !knowledgeNamespacesEqual(bundle.document.namespace, namespace)
      || !knowledgeNamespacesEqual(bundle.documentVersion.namespace, namespace)
      || bundle.document.sourceId !== bundle.source.id
      || bundle.documentVersion.sourceId !== bundle.source.id
      || bundle.documentVersion.documentId !== bundle.document.id
    ) {
      throw new Error('Knowledge version bundle namespace/source mismatch');
    }
    for (const item of bundle.chunks) {
      if (
        validateKnowledgeChunk(item.chunk).length > 0
        || !knowledgeNamespacesEqual(item.chunk.namespace, namespace)
        || item.chunk.sourceId !== bundle.source.id
        || item.chunk.documentId !== bundle.document.id
        || item.chunk.documentVersionId !== bundle.documentVersion.id
      ) {
        throw new Error('Invalid Knowledge chunk bundle');
      }
      if (item.chunk.embeddingStatus === 'ready') {
        if (item.embedding === undefined || validateEmbeddingVector(item.embedding).length > 0) throw new Error('Ready Knowledge chunk requires a valid embedding');
      } else if (item.embedding !== undefined) {
        throw new Error('Non-ready Knowledge chunk cannot persist an embedding');
      }
    }

    const ns = namespaceColumns(namespace);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const documentResult = await client.query(`
        INSERT INTO knowledge_documents (
          namespace_kind, namespace_key, id, source_id, external_key, title, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(namespace_kind, namespace_key, id) DO UPDATE SET
          external_key = EXCLUDED.external_key,
          title = EXCLUDED.title,
          updated_at = EXCLUDED.updated_at
        WHERE knowledge_documents.source_id = EXCLUDED.source_id
        RETURNING id
      `, [
        ns.kind,
        ns.key,
        bundle.document.id,
        bundle.document.sourceId,
        bundle.document.externalKey ?? null,
        bundle.document.title,
        bundle.document.createdAt,
        bundle.document.updatedAt,
      ]);
      if (documentResult.rowCount !== 1) throw new Error('Knowledge document source mismatch');

      const v = bundle.documentVersion;
      const insertedVersion = await client.query<VersionRow>(`
        INSERT INTO knowledge_document_versions (
          namespace_kind, namespace_key, id, source_id, document_id, content_hash,
          byte_length, version_status, fetched_at, verified_at, effective_from,
          effective_until, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT(namespace_kind, namespace_key, document_id, content_hash) DO NOTHING
        RETURNING namespace_kind, namespace_key, id, source_id, document_id, content_hash,
                  byte_length, version_status, fetched_at, verified_at, effective_from,
                  effective_until, created_at
      `, [
        ns.kind,
        ns.key,
        v.id,
        v.sourceId,
        v.documentId,
        v.contentHash,
        v.byteLength,
        v.status,
        v.fetchedAt ?? null,
        v.verifiedAt ?? null,
        v.effectiveFrom ?? null,
        v.effectiveUntil ?? null,
        v.createdAt,
      ]);

      if (insertedVersion.rowCount === 0) {
        const existing = await selectVersionByHash(client, namespace, v.documentId, v.contentHash);
        if (existing === null) throw new Error('Knowledge deduplication conflict could not be resolved');
        await client.query('COMMIT');
        return { status: 'deduplicated', documentVersion: existing };
      }

      for (const item of bundle.chunks) {
        const chunk = item.chunk;
        await client.query(`
          INSERT INTO knowledge_chunks (
            namespace_kind, namespace_key, id, source_id, document_id, document_version_id,
            ordinal, domain, jurisdiction, language, chunk_text, content_hash,
            embedding_status, embedding_model_id, embedding, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::vector,$16)
        `, [
          ns.kind,
          ns.key,
          chunk.id,
          chunk.sourceId,
          chunk.documentId,
          chunk.documentVersionId,
          chunk.ordinal,
          chunk.domain,
          chunk.jurisdiction,
          chunk.language,
          chunk.text,
          chunk.contentHash,
          chunk.embeddingStatus,
          chunk.embeddingModelId ?? null,
          item.embedding !== undefined ? vectorLiteral(item.embedding) : null,
          chunk.createdAt,
        ]);
      }

      await client.query('COMMIT');
      return { status: 'created', documentVersion: versionFromRow(insertedVersion.rows[0]!) };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original persistence failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchHit[]> {
    const errors = validateKnowledgeSearchRequest(request);
    if (errors.length > 0) throw new Error(`Invalid Knowledge search request: ${errors.map((item) => `${item.path}:${item.code}`).join(',')}`);

    const params: unknown[] = [vectorLiteral(request.queryEmbedding)];
    const clauses: string[] = [`c.embedding_status = 'ready'`, 'c.embedding IS NOT NULL'];
    const namespaceClauses = request.namespaces.map((namespace) => {
      const ns = namespaceColumns(namespace);
      params.push(ns.kind, ns.key);
      const kindIndex = params.length - 1;
      const keyIndex = params.length;
      return `(c.namespace_kind = $${kindIndex} AND c.namespace_key = $${keyIndex})`;
    });
    clauses.push(`(${namespaceClauses.join(' OR ')})`);

    params.push(request.filters.sourceStatuses);
    clauses.push(`s.source_status = ANY($${params.length}::text[])`);
    params.push(request.filters.versionStatuses);
    clauses.push(`v.version_status = ANY($${params.length}::text[])`);

    if (request.filters.languages !== undefined) {
      params.push(request.filters.languages);
      clauses.push(`c.language = ANY($${params.length}::text[])`);
    }
    if (request.filters.jurisdictions !== undefined) {
      params.push(request.filters.jurisdictions);
      clauses.push(`c.jurisdiction = ANY($${params.length}::text[])`);
    }

    params.push(request.filters.asOf);
    const asOfIndex = params.length;
    if (request.filters.freshness === 'current') {
      clauses.push(`v.verified_at IS NOT NULL AND v.verified_at <= $${asOfIndex}::timestamptz`);
      clauses.push(`(v.effective_from IS NULL OR v.effective_from <= $${asOfIndex}::timestamptz)`);
      clauses.push(`v.effective_until IS NOT NULL AND v.effective_until >= $${asOfIndex}::timestamptz`);
    } else if (request.filters.freshness === 'current_or_unknown') {
      clauses.push(`(v.verified_at IS NULL OR v.verified_at <= $${asOfIndex}::timestamptz)`);
      clauses.push(`(v.effective_from IS NULL OR v.effective_from <= $${asOfIndex}::timestamptz)`);
      clauses.push(`(v.effective_until IS NULL OR v.effective_until >= $${asOfIndex}::timestamptz)`);
    }

    params.push(request.limit);
    const limitIndex = params.length;
    const result = await this.pool.query<SearchRow>(`
      SELECT
        c.namespace_kind,
        c.namespace_key,
        v.id,
        v.source_id,
        v.document_id,
        v.content_hash,
        v.byte_length,
        v.version_status,
        v.fetched_at,
        v.verified_at,
        v.effective_from,
        v.effective_until,
        v.created_at,
        s.title AS source_title,
        s.publisher AS source_publisher,
        s.source_type,
        s.rights_status,
        s.source_status,
        s.jurisdiction AS source_jurisdiction,
        s.language AS source_language,
        s.canonical_url,
        s.created_at AS source_created_at,
        s.updated_at AS source_updated_at,
        d.title AS document_title,
        d.external_key,
        d.created_at AS document_created_at,
        d.updated_at AS document_updated_at,
        c.id AS chunk_id,
        c.ordinal,
        c.domain,
        c.jurisdiction AS chunk_jurisdiction,
        c.language AS chunk_language,
        c.chunk_text,
        c.content_hash AS chunk_content_hash,
        c.embedding_status,
        c.embedding_model_id,
        c.created_at AS chunk_created_at,
        GREATEST(0, LEAST(1, 1 - (c.embedding <=> $1::vector))) AS similarity
      FROM knowledge_chunks c
      JOIN knowledge_document_versions v
        ON v.namespace_kind = c.namespace_kind
       AND v.namespace_key = c.namespace_key
       AND v.id = c.document_version_id
       AND v.document_id = c.document_id
       AND v.source_id = c.source_id
      JOIN knowledge_documents d
        ON d.namespace_kind = v.namespace_kind
       AND d.namespace_key = v.namespace_key
       AND d.id = v.document_id
       AND d.source_id = v.source_id
      JOIN knowledge_sources s
        ON s.namespace_kind = d.namespace_kind
       AND s.namespace_key = d.namespace_key
       AND s.id = d.source_id
      WHERE ${clauses.join('\n        AND ')}
      ORDER BY c.embedding <=> $1::vector, c.id ASC
      LIMIT $${limitIndex}
    `, params);
    return result.rows.map(searchHitFromRow);
  }
}
