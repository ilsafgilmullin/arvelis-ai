import {
  AI_FACT_DOMAINS,
  validateKnowledgeRetrievalResult,
  type AiFactDomain,
  type KnowledgeRetrievalResult,
} from '../../src/travel/aiKnowledgeContracts';
import {
  MAX_KNOWLEDGE_RETRIEVAL_RESULTS,
  type KnowledgeSearchRequest,
} from '../../src/travel/knowledgeIngestionContracts';
import type { KnowledgeEmbeddingPort } from './knowledgeEmbeddingPort';
import { validateKnowledgeEmbeddingBatch } from './knowledgeEmbeddingPort';
import type { KnowledgeQuery, KnowledgeRetriever, KnowledgeRetrieverContext } from './aiEnginePorts';
import type { KnowledgeRepository } from './knowledgeRepository';

const RETRIEVAL_LIMIT_V1 = 12;
const SAFE_DOMAIN = new Set<string>(AI_FACT_DOMAINS);

function clampRelevance(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function asDomain(value: string): AiFactDomain {
  if (!SAFE_DOMAIN.has(value)) throw new Error('Knowledge repository returned an unsupported fact domain');
  return value as AiFactDomain;
}

export class PostgresKnowledgeRetriever implements KnowledgeRetriever {
  readonly id = 'postgres-pgvector-v1';

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embedding: KnowledgeEmbeddingPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async retrieve(
    query: KnowledgeQuery,
    context: KnowledgeRetrieverContext,
    signal: AbortSignal,
  ): Promise<KnowledgeRetrievalResult> {
    if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const vectors = await this.embedding.embed([{ id: query.queryId, text: query.text }], signal);
    const embeddingErrors = validateKnowledgeEmbeddingBatch(vectors, 1);
    if (embeddingErrors.length > 0) throw new Error(`Invalid query embedding: ${embeddingErrors.join(',')}`);

    const asOf = this.now();
    if (!Number.isFinite(asOf.getTime())) throw new Error('Invalid retrieval clock');
    const request: KnowledgeSearchRequest = {
      version: 1,
      namespaces: [
        { kind: 'global' },
        { kind: 'account', accountId: context.accountScopeId },
      ],
      queryEmbedding: vectors[0]!,
      limit: Math.min(RETRIEVAL_LIMIT_V1, MAX_KNOWLEDGE_RETRIEVAL_RESULTS),
      filters: {
        sourceStatuses: ['active'],
        versionStatuses: ['ready'],
        languages: query.locale === 'ru-RU' ? ['ru-RU', 'ru'] : [query.locale],
        freshness: 'current_or_unknown',
        asOf: asOf.toISOString(),
      },
    };
    const hits = await this.repository.search(request);
    if (hits.length > request.limit) throw new Error('Knowledge repository exceeded the bounded retrieval limit');

    const sources = new Map<string, KnowledgeRetrievalResult['sources'][number]>();
    const chunks: KnowledgeRetrievalResult['chunks'] = [];
    for (const hit of hits) {
      const sourceKey = `${hit.source.namespace.kind}:${hit.source.namespace.kind === 'account' ? hit.source.namespace.accountId : 'global'}:${hit.source.id}`;
      const sourceId = `source:${sourceKey}`;
      if (!sources.has(sourceId)) {
        sources.set(sourceId, {
          id: sourceId,
          title: hit.source.title,
          publisher: hit.source.publisher,
          sourceType: hit.source.sourceType,
          ...(hit.source.canonicalUrl !== undefined ? { url: hit.source.canonicalUrl } : {}),
          retrievedAt: hit.documentVersion.verifiedAt ?? hit.documentVersion.fetchedAt ?? hit.documentVersion.createdAt,
          ...(hit.documentVersion.effectiveUntil !== undefined ? { validUntil: hit.documentVersion.effectiveUntil } : {}),
        });
      }
      chunks.push({
        id: `chunk:${sourceKey}:${hit.chunk.id}`,
        sourceId,
        domain: asDomain(hit.chunk.domain),
        text: hit.chunk.text,
        relevance: clampRelevance(hit.similarity),
      });
    }

    const result: KnowledgeRetrievalResult = {
      version: 1,
      queryId: query.queryId,
      sources: [...sources.values()],
      chunks,
    };
    const errors = validateKnowledgeRetrievalResult(result, query.queryId);
    if (errors.length > 0) throw new Error(`Knowledge retrieval normalization failed: ${errors.map((item) => `${item.path}:${item.code}`).join(',')}`);
    return result;
  }
}
