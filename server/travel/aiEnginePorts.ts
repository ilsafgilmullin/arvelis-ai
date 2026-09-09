import type {
  AiEvidence,
  AiGatewayRequest,
  AiModelTurn,
  AiToolDescriptor,
  AiToolId,
  KnowledgeRetrievalResult,
} from '../../src/travel/aiKnowledgeContracts';

export type AiGatewayServerContext = {
  accountScopeId: string;
  authorizedTripId?: string;
};

export type AiRuntimeInput = {
  version: 1;
  requestId: string;
  prompt: string;
  locale: 'ru-RU';
  scope: AiGatewayRequest['scope'];
  tripId?: string;
  evidence: AiEvidence[];
  tools: AiToolDescriptor[];
};

export interface AiModelRuntime {
  readonly id: string;
  generate(input: AiRuntimeInput, signal: AbortSignal): Promise<AiModelTurn>;
}

export type KnowledgeQuery = {
  version: 1;
  queryId: string;
  text: string;
  locale: 'ru-RU';
  scope: AiGatewayRequest['scope'];
  tripId?: string;
};

export type KnowledgeRetrieverContext = {
  accountScopeId: string;
  authorizedTripId?: string;
  requestId: string;
};

export interface KnowledgeRetriever {
  readonly id: string;
  retrieve(query: KnowledgeQuery, context: KnowledgeRetrieverContext, signal: AbortSignal): Promise<KnowledgeRetrievalResult>;
}

export type AiToolExecutionContext = {
  accountScopeId: string;
  authorizedTripId?: string;
  requestId: string;
  locale: 'ru-RU';
};

export type AiToolEvidenceInput = Omit<AiEvidence, 'origin' | 'toolId'>;

export type AiToolResult = {
  evidence: AiToolEvidenceInput[];
};

export type AiToolHandler = (
  input: Record<string, unknown>,
  context: AiToolExecutionContext,
  signal: AbortSignal,
) => Promise<AiToolResult>;

export type AiToolRegistration = {
  id: AiToolId;
  handler: AiToolHandler;
};
