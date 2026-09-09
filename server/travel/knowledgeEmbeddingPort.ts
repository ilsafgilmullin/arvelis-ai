import {
  KNOWLEDGE_EMBEDDING_DIMENSION_V1,
  validateEmbeddingVector,
} from '../../src/travel/knowledgeIngestionContracts';

export type KnowledgeEmbeddingInput = {
  id: string;
  text: string;
};

export interface KnowledgeEmbeddingPort {
  readonly id: string;
  readonly dimensions: typeof KNOWLEDGE_EMBEDDING_DIMENSION_V1;
  embed(inputs: readonly KnowledgeEmbeddingInput[], signal: AbortSignal): Promise<number[][]>;
}

export function validateKnowledgeEmbeddingBatch(
  vectors: unknown,
  expectedCount: number,
): string[] {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) return ['embedding_batch_shape'];
  const errors: string[] = [];
  vectors.forEach((vector, index) => {
    if (validateEmbeddingVector(vector).length > 0) errors.push(`embedding_${index}_invalid`);
  });
  return errors;
}
