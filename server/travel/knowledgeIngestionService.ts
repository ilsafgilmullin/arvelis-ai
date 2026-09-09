import { createHash, randomUUID } from 'node:crypto';
import type { AiFactDomain } from '../../src/travel/aiKnowledgeContracts';
import {
  KNOWLEDGE_EMBEDDING_DIMENSION_V1,
  knowledgeNamespacesEqual,
  validateKnowledgeChunk,
  validateKnowledgeDocument,
  validateKnowledgeDocumentVersion,
  validateKnowledgeSource,
  type KnowledgeDocument,
  type KnowledgeDocumentVersion,
  type KnowledgeIngestionChunk,
  type KnowledgeNamespace,
  type KnowledgeRegistrySource,
} from '../../src/travel/knowledgeIngestionContracts';
import type { KnowledgeEmbeddingPort } from './knowledgeEmbeddingPort';
import { validateKnowledgeEmbeddingBatch } from './knowledgeEmbeddingPort';
import type { KnowledgeRepository, KnowledgeVersionBundle } from './knowledgeRepository';

export type KnowledgeIngestionChunkInput = {
  id: string;
  domain: AiFactDomain;
  jurisdiction: string;
  language: string;
  text: string;
};

export type KnowledgeIngestionRequest = {
  source: KnowledgeRegistrySource;
  document: {
    id: string;
    externalKey?: string;
    title: string;
  };
  content: string;
  chunks: KnowledgeIngestionChunkInput[];
  fetchedAt?: string;
  verifiedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
};

export type KnowledgeIngestionResult =
  | {
      status: 'deduplicated';
      documentVersion: KnowledgeDocumentVersion;
      embedded: boolean;
    }
  | {
      status: 'stored_pending_embeddings' | 'ready';
      documentVersion: KnowledgeDocumentVersion;
      chunkCount: number;
      embedded: boolean;
    };

export type KnowledgeIngestionErrorCode =
  | 'invalid_input'
  | 'source_not_active'
  | 'global_rights_not_allowed'
  | 'namespace_mismatch'
  | 'embedding_failure';

export class KnowledgeIngestionError extends Error {
  constructor(
    readonly code: KnowledgeIngestionErrorCode,
    message: string,
    readonly details: string[] = [],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'KnowledgeIngestionError';
  }
}

function normalizeContent(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
}

export function hashKnowledgeContent(value: string): string {
  return createHash('sha256').update(normalizeContent(value), 'utf8').digest('hex');
}

function validNow(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new KnowledgeIngestionError('invalid_input', 'Invalid ingestion clock.');
  return now.toISOString();
}

function namespaceDescription(namespace: KnowledgeNamespace): string {
  return namespace.kind === 'global' ? 'global' : `account:${namespace.accountId}`;
}

export class KnowledgeIngestionService {
  private readonly repository: KnowledgeRepository;
  private readonly embedding: KnowledgeEmbeddingPort | null;
  private readonly now: () => Date;
  private readonly versionId: () => string;

  constructor(options: {
    repository: KnowledgeRepository;
    embedding?: KnowledgeEmbeddingPort | null;
    now?: () => Date;
    versionId?: () => string;
  }) {
    this.repository = options.repository;
    this.embedding = options.embedding ?? null;
    this.now = options.now ?? (() => new Date());
    this.versionId = options.versionId ?? (() => randomUUID());
    if (this.embedding !== null && this.embedding.dimensions !== KNOWLEDGE_EMBEDDING_DIMENSION_V1) {
      throw new KnowledgeIngestionError('invalid_input', 'Embedding port dimension does not match Knowledge V1.');
    }
  }

  async ingest(request: KnowledgeIngestionRequest, signal?: AbortSignal): Promise<KnowledgeIngestionResult> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

    const sourceErrors = validateKnowledgeSource(request.source);
    if (sourceErrors.length > 0) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge source validation failed.', sourceErrors.map((item) => `${item.path}:${item.code}`));
    }
    if (request.source.status !== 'active') {
      throw new KnowledgeIngestionError('source_not_active', 'Only active Knowledge sources can be ingested.');
    }
    if (request.source.namespace.kind === 'global' && !['public', 'licensed'].includes(request.source.rights)) {
      throw new KnowledgeIngestionError('global_rights_not_allowed', 'Global Knowledge requires explicit public or licensed rights.');
    }

    const content = normalizeContent(request.content);
    if (content.length === 0 || Buffer.byteLength(content, 'utf8') > 20_000_000) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge document content is empty or too large.');
    }
    if (!Array.isArray(request.chunks) || request.chunks.length < 1 || request.chunks.length > 10_000) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge chunk count is outside the supported range.');
    }
    if (new Set(request.chunks.map((chunk) => chunk.id)).size !== request.chunks.length) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge chunk IDs must be unique.');
    }

    const now = validNow(this.now());
    const document: KnowledgeDocument = {
      version: 1,
      id: request.document.id,
      sourceId: request.source.id,
      namespace: request.source.namespace,
      ...(request.document.externalKey !== undefined ? { externalKey: request.document.externalKey } : {}),
      title: request.document.title,
      createdAt: now,
      updatedAt: now,
    };
    const documentErrors = validateKnowledgeDocument(document);
    if (documentErrors.length > 0) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge document validation failed.', documentErrors.map((item) => `${item.path}:${item.code}`));
    }

    await this.repository.registerSource(request.source);

    const contentHash = hashKnowledgeContent(content);
    const existing = await this.repository.findVersionByContentHash(request.source.namespace, document.id, contentHash);
    if (existing !== null) {
      if (!knowledgeNamespacesEqual(existing.namespace, request.source.namespace)) {
        throw new KnowledgeIngestionError('namespace_mismatch', 'Repository returned a version from another namespace.');
      }
      return {
        status: 'deduplicated',
        documentVersion: existing,
        embedded: false,
      };
    }

    const documentVersion: KnowledgeDocumentVersion = {
      version: 1,
      id: this.versionId(),
      sourceId: request.source.id,
      documentId: document.id,
      namespace: request.source.namespace,
      contentHash,
      byteLength: Buffer.byteLength(content, 'utf8'),
      status: 'ready',
      ...(request.fetchedAt !== undefined ? { fetchedAt: request.fetchedAt } : {}),
      ...(request.verifiedAt !== undefined ? { verifiedAt: request.verifiedAt } : {}),
      ...(request.effectiveFrom !== undefined ? { effectiveFrom: request.effectiveFrom } : {}),
      ...(request.effectiveUntil !== undefined ? { effectiveUntil: request.effectiveUntil } : {}),
      createdAt: now,
    };
    const versionErrors = validateKnowledgeDocumentVersion(documentVersion);
    if (versionErrors.length > 0) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge document version validation failed.', versionErrors.map((item) => `${item.path}:${item.code}`));
    }

    const chunks: KnowledgeIngestionChunk[] = request.chunks.map((input, ordinal) => ({
      version: 1,
      id: input.id,
      sourceId: request.source.id,
      documentId: document.id,
      documentVersionId: documentVersion.id,
      namespace: request.source.namespace,
      ordinal,
      domain: input.domain,
      jurisdiction: input.jurisdiction,
      language: input.language,
      text: normalizeContent(input.text),
      contentHash: hashKnowledgeContent(input.text),
      embeddingStatus: this.embedding === null ? 'pending' : 'ready',
      ...(this.embedding !== null ? { embeddingModelId: this.embedding.id } : {}),
      createdAt: now,
    }));

    const chunkErrors = chunks.flatMap((chunk, index) => validateKnowledgeChunk(chunk).map((error) => `chunks[${index}].${error.path}:${error.code}`));
    if (chunkErrors.length > 0) {
      throw new KnowledgeIngestionError('invalid_input', 'Knowledge chunks validation failed.', chunkErrors);
    }
    if (chunks.some((chunk) => !knowledgeNamespacesEqual(chunk.namespace, documentVersion.namespace))) {
      throw new KnowledgeIngestionError('namespace_mismatch', `Knowledge namespace mismatch: ${namespaceDescription(documentVersion.namespace)}.`);
    }

    let vectors: number[][] | null = null;
    if (this.embedding !== null) {
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      try {
        vectors = await this.embedding.embed(chunks.map((chunk) => ({ id: chunk.id, text: chunk.text })), controller.signal);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        throw new KnowledgeIngestionError('embedding_failure', 'Embedding port failed.', [], { cause: error });
      } finally {
        signal?.removeEventListener('abort', abort);
      }
      const embeddingErrors = validateKnowledgeEmbeddingBatch(vectors, chunks.length);
      if (embeddingErrors.length > 0) {
        throw new KnowledgeIngestionError('embedding_failure', 'Embedding port returned an invalid batch.', embeddingErrors);
      }
    }

    const bundle: KnowledgeVersionBundle = {
      source: request.source,
      document,
      documentVersion,
      chunks: chunks.map((chunk, index) => ({
        chunk,
        ...(vectors !== null ? { embedding: vectors[index]! } : {}),
      })),
    };
    const saveResult = await this.repository.saveVersion(bundle);
    if (saveResult.status === 'deduplicated') {
      if (!knowledgeNamespacesEqual(saveResult.documentVersion.namespace, request.source.namespace)) {
        throw new KnowledgeIngestionError('namespace_mismatch', 'Repository deduplication crossed a Knowledge namespace.');
      }
      return {
        status: 'deduplicated',
        documentVersion: saveResult.documentVersion,
        embedded: false,
      };
    }

    return {
      status: vectors === null ? 'stored_pending_embeddings' : 'ready',
      documentVersion: saveResult.documentVersion,
      chunkCount: chunks.length,
      embedded: vectors !== null,
    };
  }
}
