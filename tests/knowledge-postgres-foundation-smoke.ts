import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  KNOWLEDGE_EMBEDDING_DIMENSION_V1,
  type KnowledgeNamespace,
  type KnowledgeRegistrySource,
} from '../src/travel/knowledgeIngestionContracts';
import { PostgresKnowledgeRepository } from '../server/persistence/postgres/knowledgeRepository';
import type { KnowledgeVersionBundle } from '../server/travel/knowledgeRepository';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for the PostgreSQL Knowledge smoke test.');

const now = new Date('2026-09-09T14:30:00.000Z');
const queryVector = Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSION_V1 }, (_, index) => index === 0 ? 1 : 0);

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function source(
  id: string,
  namespace: KnowledgeNamespace,
  options: { status?: KnowledgeRegistrySource['status']; language?: string; jurisdiction?: string } = {},
): KnowledgeRegistrySource {
  return {
    version: 1,
    id,
    namespace,
    title: `Source ${id}`,
    publisher: namespace.kind === 'global' ? 'Official authority' : 'Account owner',
    sourceType: namespace.kind === 'global' ? 'official' : 'user',
    rights: namespace.kind === 'global' ? 'public' : 'user_owned',
    status: options.status ?? 'active',
    jurisdiction: options.jurisdiction ?? (namespace.kind === 'global' ? 'GLOBAL' : 'RU'),
    language: options.language ?? 'ru-RU',
    ...(namespace.kind === 'global' ? { canonicalUrl: `https://authority.example.test/${id}` } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function bundle(
  sourceValue: KnowledgeRegistrySource,
  suffix: string,
  embedding: number[],
  options: { effectiveUntil?: string; language?: string; jurisdiction?: string; content?: string } = {},
): KnowledgeVersionBundle {
  const content = options.content ?? `Knowledge ${suffix}`;
  const documentId = `doc-${suffix}`;
  const versionId = `version-${suffix}`;
  return {
    source: sourceValue,
    document: {
      version: 1,
      id: documentId,
      sourceId: sourceValue.id,
      namespace: sourceValue.namespace,
      title: `Document ${suffix}`,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    documentVersion: {
      version: 1,
      id: versionId,
      sourceId: sourceValue.id,
      documentId,
      namespace: sourceValue.namespace,
      contentHash: hash(content),
      byteLength: Buffer.byteLength(content, 'utf8'),
      status: 'ready',
      fetchedAt: now.toISOString(),
      verifiedAt: now.toISOString(),
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: options.effectiveUntil ?? '2026-12-31T23:59:59.000Z',
      createdAt: now.toISOString(),
    },
    chunks: [{
      chunk: {
        version: 1,
        id: `chunk-${suffix}`,
        sourceId: sourceValue.id,
        documentId,
        documentVersionId: versionId,
        namespace: sourceValue.namespace,
        ordinal: 0,
        domain: 'destination',
        jurisdiction: options.jurisdiction ?? sourceValue.jurisdiction,
        language: options.language ?? sourceValue.language,
        text: content,
        contentHash: hash(`chunk:${content}`),
        embeddingStatus: 'ready',
        embeddingModelId: 'fixture-qwen3-embedding-0.6b',
        createdAt: now.toISOString(),
      },
      embedding,
    }],
  };
}

async function main() {
  const pool = new Pool({ connectionString, max: 3, application_name: 'arvelis-knowledge-smoke' });
  try {
    const extension = await pool.query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    assert.equal(extension.rowCount, 1, 'pgvector extension must be installed by migration 003');

    const vectorColumn = await pool.query<{ formatted_type: string }>(`
      SELECT format_type(a.atttypid, a.atttypmod) AS formatted_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = 'knowledge_chunks'
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `);
    assert.equal(vectorColumn.rows[0]?.formatted_type, 'vector(1024)', 'Knowledge embedding column must match Qwen3-Embedding-0.6B V1 dimension');

    for (const accountId of ['acct-knowledge-a', 'acct-knowledge-b']) {
      await pool.query(`
        INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
        VALUES ($1, $2, 'active', 1, $3, $3)
        ON CONFLICT(id) DO NOTHING
      `, [accountId, accountId, now.getTime()]);
    }

    const repository = new PostgresKnowledgeRepository(pool);
    const global = source('src-global', { kind: 'global' });
    const accountA = source('src-account-a', { kind: 'account', accountId: 'acct-knowledge-a' });
    const accountB = source('src-account-b', { kind: 'account', accountId: 'acct-knowledge-b' });
    const disabledA = source('src-disabled-a', { kind: 'account', accountId: 'acct-knowledge-a' }, { status: 'disabled' });
    const expiredA = source('src-expired-a', { kind: 'account', accountId: 'acct-knowledge-a' });
    const englishA = source('src-english-a', { kind: 'account', accountId: 'acct-knowledge-a' }, { language: 'en' });

    for (const value of [global, accountA, accountB, disabledA, expiredA, englishA]) await repository.registerSource(value);

    const createdGlobal = await repository.saveVersion(bundle(global, 'global', queryVector));
    const createdA = await repository.saveVersion(bundle(accountA, 'account-a', queryVector));
    await repository.saveVersion(bundle(accountB, 'account-b', queryVector));
    await repository.saveVersion(bundle(disabledA, 'disabled-a', queryVector));
    await repository.saveVersion(bundle(expiredA, 'expired-a', queryVector, { effectiveUntil: '2026-09-01T00:00:00.000Z' }));
    await repository.saveVersion(bundle(englishA, 'english-a', queryVector, { language: 'en' }));
    assert.equal(createdGlobal.status, 'created');
    assert.equal(createdA.status, 'created');

    const duplicateBundle = bundle(accountA, 'account-a-duplicate-attempt', queryVector, { content: 'Knowledge account-a' });
    duplicateBundle.document.id = 'doc-account-a';
    duplicateBundle.documentVersion.documentId = 'doc-account-a';
    duplicateBundle.chunks[0]!.chunk.documentId = 'doc-account-a';
    const duplicate = await repository.saveVersion(duplicateBundle);
    assert.equal(duplicate.status, 'deduplicated', 'same content hash in same namespace/document must be atomic-deduplicated');
    assert.equal(duplicate.documentVersion.id, 'version-account-a');

    const privateVersionCount = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM knowledge_document_versions
      WHERE namespace_kind = 'account' AND namespace_key = 'acct-knowledge-a' AND document_id = 'doc-account-a'
    `);
    assert.equal(privateVersionCount.rows[0]?.count, '1');

    const hits = await repository.search({
      version: 1,
      namespaces: [{ kind: 'global' }, { kind: 'account', accountId: 'acct-knowledge-a' }],
      queryEmbedding: queryVector,
      limit: 10,
      filters: {
        sourceStatuses: ['active'],
        versionStatuses: ['ready'],
        languages: ['ru-RU'],
        jurisdictions: ['GLOBAL', 'RU'],
        freshness: 'current_or_unknown',
        asOf: now.toISOString(),
      },
    });
    const hitNamespaces = hits.map((hit) => hit.source.namespace.kind === 'global' ? 'global' : hit.source.namespace.accountId).sort();
    assert.deepEqual(hitNamespaces, ['acct-knowledge-a', 'global'], 'retrieval must include global + current account only');
    assert.equal(hits.some((hit) => hit.source.id === 'src-account-b'), false, 'another account must never leak into retrieval');
    assert.equal(hits.some((hit) => hit.source.id === 'src-disabled-a'), false, 'disabled sources must be filtered');
    assert.equal(hits.some((hit) => hit.source.id === 'src-expired-a'), false, 'expired versions must be filtered');
    assert.equal(hits.some((hit) => hit.source.id === 'src-english-a'), false, 'language filter must be enforced');

    const privateOnly = await repository.search({
      version: 1,
      namespaces: [{ kind: 'account', accountId: 'acct-knowledge-b' }],
      queryEmbedding: queryVector,
      limit: 5,
      filters: {
        sourceStatuses: ['active'],
        versionStatuses: ['ready'],
        languages: ['ru-RU'],
        freshness: 'any',
        asOf: now.toISOString(),
      },
    });
    assert.deepEqual(privateOnly.map((hit) => hit.source.id), ['src-account-b']);

    await assert.rejects(
      pool.query(`
        INSERT INTO knowledge_documents (namespace_kind, namespace_key, id, source_id, title, created_at, updated_at)
        VALUES ('account', 'acct-knowledge-a', 'illegal-cross-account-doc', 'src-account-b', 'Illegal', $1, $1)
      `, [now.toISOString()]),
      /foreign key|violates/i,
      'database foreign keys must reject cross-account Knowledge linkage',
    );

    console.log('ARVELIS PostgreSQL/pgvector Knowledge compatibility: PASS');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
