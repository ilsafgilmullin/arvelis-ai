import assert from 'node:assert/strict';
import type { AiFactDomain } from '../src/travel/aiKnowledgeContracts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSION_V1,
  validateKnowledgeSearchRequest,
  validateKnowledgeSource,
  type KnowledgeDocumentVersion,
  type KnowledgeNamespace,
  type KnowledgeRegistrySource,
  type KnowledgeSearchHit,
  type KnowledgeSearchRequest,
} from '../src/travel/knowledgeIngestionContracts';
import type { KnowledgeEmbeddingPort } from '../server/travel/knowledgeEmbeddingPort';
import {
  hashKnowledgeContent,
  KnowledgeIngestionError,
  KnowledgeIngestionService,
  type KnowledgeIngestionRequest,
} from '../server/travel/knowledgeIngestionService';
import type {
  KnowledgeRepository,
  KnowledgeSaveVersionResult,
  KnowledgeVersionBundle,
} from '../server/travel/knowledgeRepository';
import { PostgresKnowledgeRetriever } from '../server/travel/postgresKnowledgeRetriever';

const now = new Date('2026-09-09T14:00:00.000Z');
const vector = Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSION_V1 }, (_, index) => index === 0 ? 1 : 0);

function namespaceKey(namespace: KnowledgeNamespace): string {
  return namespace.kind === 'global' ? 'global' : `account:${namespace.accountId}`;
}

function source(namespace: KnowledgeNamespace, overrides: Partial<KnowledgeRegistrySource> = {}): KnowledgeRegistrySource {
  return {
    version: 1,
    id: 'source-1',
    namespace,
    title: 'Knowledge source',
    publisher: namespace.kind === 'global' ? 'Official authority' : 'Account user',
    sourceType: namespace.kind === 'global' ? 'official' : 'user',
    rights: namespace.kind === 'global' ? 'public' : 'user_owned',
    status: 'active',
    jurisdiction: namespace.kind === 'global' ? 'GLOBAL' : 'RU',
    language: 'ru-RU',
    ...(namespace.kind === 'global' ? { canonicalUrl: 'https://authority.example.test/source' } : {}),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function ingestionRequest(namespace: KnowledgeNamespace, content = 'Первая строка\nВторая строка'): KnowledgeIngestionRequest {
  return {
    source: source(namespace),
    document: { id: 'document-1', externalKey: 'fixture-1', title: 'Fixture document' },
    content,
    chunks: [{
      id: 'chunk-1',
      domain: 'destination' satisfies AiFactDomain,
      jurisdiction: namespace.kind === 'global' ? 'GLOBAL' : 'RU',
      language: 'ru-RU',
      text: content,
    }],
    fetchedAt: now.toISOString(),
    verifiedAt: now.toISOString(),
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveUntil: '2026-12-31T23:59:59.000Z',
  };
}

class MemoryKnowledgeRepository implements KnowledgeRepository {
  readonly sources: KnowledgeRegistrySource[] = [];
  readonly bundles: KnowledgeVersionBundle[] = [];
  readonly versions = new Map<string, KnowledgeDocumentVersion>();
  searchRequests: KnowledgeSearchRequest[] = [];
  searchHits: KnowledgeSearchHit[] = [];

  async registerSource(value: KnowledgeRegistrySource): Promise<void> {
    this.sources.push(value);
  }

  async findVersionByContentHash(namespace: KnowledgeNamespace, documentId: string, contentHash: string): Promise<KnowledgeDocumentVersion | null> {
    return this.versions.get(`${namespaceKey(namespace)}:${documentId}:${contentHash}`) ?? null;
  }

  async saveVersion(bundle: KnowledgeVersionBundle): Promise<KnowledgeSaveVersionResult> {
    const key = `${namespaceKey(bundle.documentVersion.namespace)}:${bundle.documentVersion.documentId}:${bundle.documentVersion.contentHash}`;
    const existing = this.versions.get(key);
    if (existing) return { status: 'deduplicated', documentVersion: existing };
    this.bundles.push(bundle);
    this.versions.set(key, bundle.documentVersion);
    return { status: 'created', documentVersion: bundle.documentVersion };
  }

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchHit[]> {
    this.searchRequests.push(request);
    return this.searchHits;
  }
}

async function expectIngestionError(promise: Promise<unknown>, code: KnowledgeIngestionError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof KnowledgeIngestionError && error.code === code);
}

async function main() {
  assert.equal(hashKnowledgeContent('Текст\r\nстрока'), hashKnowledgeContent('Текст\nстрока'), 'content hashing must normalize line endings');

  const invalidGlobalUser = source({ kind: 'global' }, { sourceType: 'user', rights: 'user_owned' });
  const invalidGlobalErrors = validateKnowledgeSource(invalidGlobalUser);
  assert.ok(invalidGlobalErrors.some((error) => error.code === 'namespace_mismatch'), 'user-owned source must fail closed in global Knowledge');

  const restrictedRepository = new MemoryKnowledgeRepository();
  const restrictedService = new KnowledgeIngestionService({ repository: restrictedRepository, now: () => now, versionId: () => 'version-restricted' });
  const restricted = ingestionRequest({ kind: 'global' });
  restricted.source = source({ kind: 'global' }, { rights: 'restricted' });
  await expectIngestionError(restrictedService.ingest(restricted), 'global_rights_not_allowed');
  assert.equal(restrictedRepository.bundles.length, 0);

  const repository = new MemoryKnowledgeRepository();
  let versionCounter = 0;
  const service = new KnowledgeIngestionService({
    repository,
    now: () => now,
    versionId: () => `version-${++versionCounter}`,
  });
  const accountA: KnowledgeNamespace = { kind: 'account', accountId: 'acct-a' };
  const first = await service.ingest(ingestionRequest(accountA, 'Первая строка\r\nВторая строка'));
  assert.equal(first.status, 'stored_pending_embeddings');
  assert.equal(first.embedded, false);
  assert.equal(repository.bundles.length, 1);
  assert.equal(repository.bundles[0]?.chunks[0]?.chunk.embeddingStatus, 'pending');
  assert.equal(repository.bundles[0]?.chunks[0]?.embedding, undefined);

  const duplicate = await service.ingest(ingestionRequest(accountA, 'Первая строка\nВторая строка'));
  assert.equal(duplicate.status, 'deduplicated');
  assert.equal(repository.bundles.length, 1, 'same normalized content in the same account/document must deduplicate');

  const accountB: KnowledgeNamespace = { kind: 'account', accountId: 'acct-b' };
  const otherAccount = await service.ingest(ingestionRequest(accountB, 'Первая строка\nВторая строка'));
  assert.equal(otherAccount.status, 'stored_pending_embeddings');
  assert.equal(repository.bundles.length, 2, 'deduplication must never cross account namespaces');

  const mismatchedRepository = new MemoryKnowledgeRepository();
  mismatchedRepository.findVersionByContentHash = async (_namespace, documentId, contentHash) => ({
    version: 1,
    id: 'foreign-version',
    sourceId: 'source-1',
    documentId,
    namespace: { kind: 'account', accountId: 'acct-b' },
    contentHash,
    byteLength: 10,
    status: 'ready',
    createdAt: now.toISOString(),
  });
  await expectIngestionError(
    new KnowledgeIngestionService({ repository: mismatchedRepository, now: () => now }).ingest(ingestionRequest(accountA)),
    'namespace_mismatch',
  );

  const badEmbedding: KnowledgeEmbeddingPort = {
    id: 'fixture-invalid-embedding',
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSION_V1,
    async embed() {
      return [[1, 2, 3]];
    },
  };
  await expectIngestionError(
    new KnowledgeIngestionService({ repository: new MemoryKnowledgeRepository(), embedding: badEmbedding, now: () => now }).ingest(ingestionRequest(accountA)),
    'embedding_failure',
  );

  const twoAccounts: KnowledgeSearchRequest = {
    version: 1,
    namespaces: [{ kind: 'account', accountId: 'acct-a' }, { kind: 'account', accountId: 'acct-b' }],
    queryEmbedding: vector,
    limit: 5,
    filters: {
      sourceStatuses: ['active'],
      versionStatuses: ['ready'],
      freshness: 'current',
      asOf: now.toISOString(),
    },
  };
  assert.ok(validateKnowledgeSearchRequest(twoAccounts).some((error) => error.code === 'namespace_mismatch'), 'one retrieval request must not span two private accounts');

  const retrievalRepository = new MemoryKnowledgeRepository();
  const accountSource = source(accountA);
  const accountVersion: KnowledgeDocumentVersion = {
    version: 1,
    id: 'version-search',
    sourceId: accountSource.id,
    documentId: 'document-search',
    namespace: accountA,
    contentHash: 'a'.repeat(64),
    byteLength: 100,
    status: 'ready',
    fetchedAt: now.toISOString(),
    verifiedAt: now.toISOString(),
    effectiveUntil: '2026-12-31T23:59:59.000Z',
    createdAt: now.toISOString(),
  };
  retrievalRepository.searchHits = [{
    source: accountSource,
    document: {
      version: 1,
      id: 'document-search',
      sourceId: accountSource.id,
      namespace: accountA,
      title: 'Private account document',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    documentVersion: accountVersion,
    chunk: {
      version: 1,
      id: 'chunk-search',
      sourceId: accountSource.id,
      documentId: 'document-search',
      documentVersionId: accountVersion.id,
      namespace: accountA,
      ordinal: 0,
      domain: 'destination',
      jurisdiction: 'RU',
      language: 'ru-RU',
      text: 'Private account evidence.',
      contentHash: 'b'.repeat(64),
      embeddingStatus: 'ready',
      embeddingModelId: 'fixture-embedding',
      createdAt: now.toISOString(),
    },
    similarity: 0.91,
  }];
  const goodEmbedding: KnowledgeEmbeddingPort = {
    id: 'fixture-embedding',
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSION_V1,
    async embed(inputs, signal) {
      assert.equal(signal.aborted, false);
      assert.equal(inputs.length, 1);
      return [vector];
    },
  };
  const retriever = new PostgresKnowledgeRetriever(retrievalRepository, goodEmbedding, () => now);
  const retrieval = await retriever.retrieve(
    { version: 1, queryId: 'query-1', text: 'Что важно?', locale: 'ru-RU', scope: 'general' },
    { accountScopeId: 'acct-a', requestId: 'request-1' },
    new AbortController().signal,
  );
  const issuedSearch = retrievalRepository.searchRequests[0]!;
  assert.deepEqual(issuedSearch.namespaces, [{ kind: 'global' }, { kind: 'account', accountId: 'acct-a' }]);
  assert.deepEqual(issuedSearch.filters.sourceStatuses, ['active']);
  assert.deepEqual(issuedSearch.filters.versionStatuses, ['ready']);
  assert.equal(issuedSearch.filters.freshness, 'current_or_unknown');
  assert.deepEqual(issuedSearch.filters.languages, ['ru-RU', 'ru']);
  assert.equal(retrieval.sources.length, 1);
  assert.equal(retrieval.chunks[0]?.text, 'Private account evidence.');

  const overLimitRepository = new MemoryKnowledgeRepository();
  overLimitRepository.searchHits = Array.from({ length: 13 }, () => retrievalRepository.searchHits[0]!);
  await assert.rejects(
    new PostgresKnowledgeRetriever(overLimitRepository, goodEmbedding, () => now).retrieve(
      { version: 1, queryId: 'query-over', text: 'Bounded?', locale: 'ru-RU', scope: 'general' },
      { accountScopeId: 'acct-a', requestId: 'request-over' },
      new AbortController().signal,
    ),
    /bounded retrieval limit/,
  );

  console.log('ARVELIS Retrieval & Knowledge Ingestion Foundation: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
