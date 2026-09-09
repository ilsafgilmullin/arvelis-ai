import type {
  KnowledgeDocument,
  KnowledgeDocumentVersion,
  KnowledgeIngestionChunk,
  KnowledgeNamespace,
  KnowledgeRegistrySource,
  KnowledgeSearchHit,
  KnowledgeSearchRequest,
} from '../../src/travel/knowledgeIngestionContracts';

export type KnowledgeChunkWithEmbedding = {
  chunk: KnowledgeIngestionChunk;
  embedding?: number[];
};

export type KnowledgeVersionBundle = {
  source: KnowledgeRegistrySource;
  document: KnowledgeDocument;
  documentVersion: KnowledgeDocumentVersion;
  chunks: KnowledgeChunkWithEmbedding[];
};

export type KnowledgeSaveVersionResult = {
  status: 'created' | 'deduplicated';
  documentVersion: KnowledgeDocumentVersion;
};

export interface KnowledgeRepository {
  registerSource(source: KnowledgeRegistrySource): Promise<void>;
  findVersionByContentHash(
    namespace: KnowledgeNamespace,
    documentId: string,
    contentHash: string,
  ): Promise<KnowledgeDocumentVersion | null>;
  saveVersion(bundle: KnowledgeVersionBundle): Promise<KnowledgeSaveVersionResult>;
  search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchHit[]>;
}
