export const KNOWLEDGE_INGESTION_CONTRACT_VERSION = 1 as const;
export const KNOWLEDGE_EMBEDDING_DIMENSION_V1 = 1024 as const;
export const MAX_KNOWLEDGE_RETRIEVAL_RESULTS = 20 as const;
export const MAX_KNOWLEDGE_RETRIEVAL_CANDIDATES = 80 as const;
export const MAX_KNOWLEDGE_CHUNK_TEXT = 4_000 as const;

export const KNOWLEDGE_SOURCE_TYPES = ['official', 'editorial', 'user'] as const;
export type KnowledgeRegistrySourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

export const KNOWLEDGE_RIGHTS = ['public', 'licensed', 'user_owned', 'restricted', 'unknown'] as const;
export type KnowledgeRights = (typeof KNOWLEDGE_RIGHTS)[number];

export const KNOWLEDGE_SOURCE_STATUSES = ['pending', 'active', 'disabled', 'revoked'] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

export const KNOWLEDGE_VERSION_STATUSES = ['processing', 'ready', 'failed', 'superseded', 'quarantined'] as const;
export type KnowledgeVersionStatus = (typeof KNOWLEDGE_VERSION_STATUSES)[number];

export const KNOWLEDGE_EMBEDDING_STATUSES = ['pending', 'ready', 'failed', 'disabled'] as const;
export type KnowledgeEmbeddingStatus = (typeof KNOWLEDGE_EMBEDDING_STATUSES)[number];

export type KnowledgeNamespace =
  | { kind: 'global' }
  | { kind: 'account'; accountId: string };

export type KnowledgeRegistrySource = {
  version: 1;
  id: string;
  namespace: KnowledgeNamespace;
  title: string;
  publisher: string;
  sourceType: KnowledgeRegistrySourceType;
  rights: KnowledgeRights;
  status: KnowledgeSourceStatus;
  jurisdiction: string;
  language: string;
  canonicalUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocument = {
  version: 1;
  id: string;
  sourceId: string;
  namespace: KnowledgeNamespace;
  externalKey?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDocumentVersion = {
  version: 1;
  id: string;
  sourceId: string;
  documentId: string;
  namespace: KnowledgeNamespace;
  contentHash: string;
  byteLength: number;
  status: KnowledgeVersionStatus;
  fetchedAt?: string;
  verifiedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  createdAt: string;
};

export type KnowledgeIngestionChunk = {
  version: 1;
  id: string;
  sourceId: string;
  documentId: string;
  documentVersionId: string;
  namespace: KnowledgeNamespace;
  ordinal: number;
  domain: string;
  jurisdiction: string;
  language: string;
  text: string;
  contentHash: string;
  embeddingStatus: KnowledgeEmbeddingStatus;
  embeddingModelId?: string;
  createdAt: string;
};

export type KnowledgeSearchFreshness = 'current' | 'current_or_unknown' | 'any';

export type KnowledgeSearchRequest = {
  version: 1;
  namespaces: KnowledgeNamespace[];
  queryEmbedding: number[];
  limit: number;
  filters: {
    sourceStatuses: KnowledgeSourceStatus[];
    versionStatuses: KnowledgeVersionStatus[];
    languages?: string[];
    jurisdictions?: string[];
    freshness: KnowledgeSearchFreshness;
    asOf: string;
  };
};

export type KnowledgeSearchHit = {
  chunk: KnowledgeIngestionChunk;
  source: KnowledgeRegistrySource;
  document: KnowledgeDocument;
  documentVersion: KnowledgeDocumentVersion;
  similarity: number;
};

export type KnowledgeContractError = {
  path: string;
  code: 'invalid_shape' | 'invalid_value' | 'duplicate_value' | 'namespace_mismatch';
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LANGUAGE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const JURISDICTION = /^(?:GLOBAL|[A-Z0-9][A-Z0-9._:-]{1,31})$/;

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isTrimmedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isEnumValue<T extends readonly string[]>(catalog: T, value: unknown): value is T[number] {
  return typeof value === 'string' && catalog.includes(value);
}

export function validateKnowledgeNamespace(namespace: unknown, path = 'namespace'): KnowledgeContractError[] {
  if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) return [{ path, code: 'invalid_shape' }];
  const candidate = namespace as Partial<KnowledgeNamespace> & { accountId?: unknown };
  if (candidate.kind === 'global') {
    return candidate.accountId === undefined ? [] : [{ path: `${path}.accountId`, code: 'invalid_value' }];
  }
  if (candidate.kind === 'account') {
    return typeof candidate.accountId === 'string' && SAFE_ID.test(candidate.accountId)
      ? []
      : [{ path: `${path}.accountId`, code: 'invalid_value' }];
  }
  return [{ path: `${path}.kind`, code: 'invalid_value' }];
}

export function knowledgeNamespaceKey(namespace: KnowledgeNamespace): string {
  return namespace.kind === 'global' ? 'global' : namespace.accountId;
}

export function knowledgeNamespacesEqual(left: KnowledgeNamespace, right: KnowledgeNamespace): boolean {
  return left.kind === right.kind && knowledgeNamespaceKey(left) === knowledgeNamespaceKey(right);
}

export function validateKnowledgeSource(source: KnowledgeRegistrySource): KnowledgeContractError[] {
  const errors = validateKnowledgeNamespace(source.namespace);
  if (source.version !== 1) errors.push({ path: 'version', code: 'invalid_value' });
  if (!SAFE_ID.test(source.id)) errors.push({ path: 'id', code: 'invalid_value' });
  if (!isTrimmedText(source.title, 240)) errors.push({ path: 'title', code: 'invalid_value' });
  if (!isTrimmedText(source.publisher, 160)) errors.push({ path: 'publisher', code: 'invalid_value' });
  if (!isEnumValue(KNOWLEDGE_SOURCE_TYPES, source.sourceType)) errors.push({ path: 'sourceType', code: 'invalid_value' });
  if (!isEnumValue(KNOWLEDGE_RIGHTS, source.rights)) errors.push({ path: 'rights', code: 'invalid_value' });
  if (!isEnumValue(KNOWLEDGE_SOURCE_STATUSES, source.status)) errors.push({ path: 'status', code: 'invalid_value' });
  if (!JURISDICTION.test(source.jurisdiction)) errors.push({ path: 'jurisdiction', code: 'invalid_value' });
  if (!LANGUAGE.test(source.language)) errors.push({ path: 'language', code: 'invalid_value' });
  if (source.canonicalUrl !== undefined && !isHttpsUrl(source.canonicalUrl)) errors.push({ path: 'canonicalUrl', code: 'invalid_value' });
  if (!isTimestamp(source.createdAt)) errors.push({ path: 'createdAt', code: 'invalid_value' });
  if (!isTimestamp(source.updatedAt) || (isTimestamp(source.createdAt) && Date.parse(source.updatedAt) < Date.parse(source.createdAt))) {
    errors.push({ path: 'updatedAt', code: 'invalid_value' });
  }
  if (source.namespace.kind === 'global' && source.sourceType === 'user') errors.push({ path: 'sourceType', code: 'namespace_mismatch' });
  if (source.namespace.kind === 'global' && source.rights === 'user_owned') errors.push({ path: 'rights', code: 'namespace_mismatch' });
  return errors;
}

export function validateKnowledgeDocument(document: KnowledgeDocument): KnowledgeContractError[] {
  const errors = validateKnowledgeNamespace(document.namespace);
  if (document.version !== 1) errors.push({ path: 'version', code: 'invalid_value' });
  if (!SAFE_ID.test(document.id)) errors.push({ path: 'id', code: 'invalid_value' });
  if (!SAFE_ID.test(document.sourceId)) errors.push({ path: 'sourceId', code: 'invalid_value' });
  if (document.externalKey !== undefined && !isTrimmedText(document.externalKey, 512)) errors.push({ path: 'externalKey', code: 'invalid_value' });
  if (!isTrimmedText(document.title, 300)) errors.push({ path: 'title', code: 'invalid_value' });
  if (!isTimestamp(document.createdAt)) errors.push({ path: 'createdAt', code: 'invalid_value' });
  if (!isTimestamp(document.updatedAt) || (isTimestamp(document.createdAt) && Date.parse(document.updatedAt) < Date.parse(document.createdAt))) {
    errors.push({ path: 'updatedAt', code: 'invalid_value' });
  }
  return errors;
}

export function validateKnowledgeDocumentVersion(documentVersion: KnowledgeDocumentVersion): KnowledgeContractError[] {
  const errors = validateKnowledgeNamespace(documentVersion.namespace);
  if (documentVersion.version !== 1) errors.push({ path: 'version', code: 'invalid_value' });
  if (!SAFE_ID.test(documentVersion.id)) errors.push({ path: 'id', code: 'invalid_value' });
  if (!SAFE_ID.test(documentVersion.sourceId)) errors.push({ path: 'sourceId', code: 'invalid_value' });
  if (!SAFE_ID.test(documentVersion.documentId)) errors.push({ path: 'documentId', code: 'invalid_value' });
  if (!SHA256.test(documentVersion.contentHash)) errors.push({ path: 'contentHash', code: 'invalid_value' });
  if (!Number.isSafeInteger(documentVersion.byteLength) || documentVersion.byteLength < 1 || documentVersion.byteLength > 20_000_000) {
    errors.push({ path: 'byteLength', code: 'invalid_value' });
  }
  if (!isEnumValue(KNOWLEDGE_VERSION_STATUSES, documentVersion.status)) errors.push({ path: 'status', code: 'invalid_value' });
  for (const key of ['fetchedAt', 'verifiedAt', 'effectiveFrom', 'effectiveUntil'] as const) {
    const value = documentVersion[key];
    if (value !== undefined && !isTimestamp(value)) errors.push({ path: key, code: 'invalid_value' });
  }
  if (documentVersion.effectiveFrom && documentVersion.effectiveUntil && Date.parse(documentVersion.effectiveUntil) < Date.parse(documentVersion.effectiveFrom)) {
    errors.push({ path: 'effectiveUntil', code: 'invalid_value' });
  }
  if (documentVersion.fetchedAt && documentVersion.verifiedAt && Date.parse(documentVersion.verifiedAt) < Date.parse(documentVersion.fetchedAt)) {
    errors.push({ path: 'verifiedAt', code: 'invalid_value' });
  }
  if (!isTimestamp(documentVersion.createdAt)) errors.push({ path: 'createdAt', code: 'invalid_value' });
  return errors;
}

export function validateKnowledgeChunk(chunk: KnowledgeIngestionChunk): KnowledgeContractError[] {
  const errors = validateKnowledgeNamespace(chunk.namespace);
  if (chunk.version !== 1) errors.push({ path: 'version', code: 'invalid_value' });
  for (const key of ['id', 'sourceId', 'documentId', 'documentVersionId'] as const) {
    if (!SAFE_ID.test(chunk[key])) errors.push({ path: key, code: 'invalid_value' });
  }
  if (!Number.isSafeInteger(chunk.ordinal) || chunk.ordinal < 0 || chunk.ordinal > 100_000) errors.push({ path: 'ordinal', code: 'invalid_value' });
  if (!isTrimmedText(chunk.domain, 64)) errors.push({ path: 'domain', code: 'invalid_value' });
  if (!JURISDICTION.test(chunk.jurisdiction)) errors.push({ path: 'jurisdiction', code: 'invalid_value' });
  if (!LANGUAGE.test(chunk.language)) errors.push({ path: 'language', code: 'invalid_value' });
  if (!isTrimmedText(chunk.text, MAX_KNOWLEDGE_CHUNK_TEXT)) errors.push({ path: 'text', code: 'invalid_value' });
  if (!SHA256.test(chunk.contentHash)) errors.push({ path: 'contentHash', code: 'invalid_value' });
  if (!isEnumValue(KNOWLEDGE_EMBEDDING_STATUSES, chunk.embeddingStatus)) errors.push({ path: 'embeddingStatus', code: 'invalid_value' });
  if (chunk.embeddingStatus === 'ready' && !isTrimmedText(chunk.embeddingModelId, 160)) errors.push({ path: 'embeddingModelId', code: 'invalid_value' });
  if (chunk.embeddingStatus !== 'ready' && chunk.embeddingModelId !== undefined && !isTrimmedText(chunk.embeddingModelId, 160)) errors.push({ path: 'embeddingModelId', code: 'invalid_value' });
  if (!isTimestamp(chunk.createdAt)) errors.push({ path: 'createdAt', code: 'invalid_value' });
  return errors;
}

export function validateEmbeddingVector(vector: unknown): KnowledgeContractError[] {
  if (!Array.isArray(vector) || vector.length !== KNOWLEDGE_EMBEDDING_DIMENSION_V1) return [{ path: 'queryEmbedding', code: 'invalid_shape' }];
  return vector.every((value) => typeof value === 'number' && Number.isFinite(value))
    ? []
    : [{ path: 'queryEmbedding', code: 'invalid_value' }];
}

export function validateKnowledgeSearchRequest(request: KnowledgeSearchRequest): KnowledgeContractError[] {
  const errors: KnowledgeContractError[] = [];
  if (request.version !== 1) errors.push({ path: 'version', code: 'invalid_value' });
  if (!Array.isArray(request.namespaces) || request.namespaces.length < 1 || request.namespaces.length > 2) {
    errors.push({ path: 'namespaces', code: 'invalid_shape' });
  } else {
    request.namespaces.forEach((namespace, index) => errors.push(...validateKnowledgeNamespace(namespace, `namespaces[${index}]`)));
    const keys = request.namespaces.map((namespace) => `${namespace.kind}:${knowledgeNamespaceKey(namespace)}`);
    if (new Set(keys).size !== keys.length) errors.push({ path: 'namespaces', code: 'duplicate_value' });
    const accountCount = request.namespaces.filter((namespace) => namespace.kind === 'account').length;
    if (accountCount > 1) errors.push({ path: 'namespaces', code: 'namespace_mismatch' });
  }
  errors.push(...validateEmbeddingVector(request.queryEmbedding));
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_KNOWLEDGE_RETRIEVAL_RESULTS) errors.push({ path: 'limit', code: 'invalid_value' });
  if (!request.filters || typeof request.filters !== 'object') return [...errors, { path: 'filters', code: 'invalid_shape' }];
  if (!Array.isArray(request.filters.sourceStatuses) || request.filters.sourceStatuses.length < 1 || request.filters.sourceStatuses.some((item) => !isEnumValue(KNOWLEDGE_SOURCE_STATUSES, item))) {
    errors.push({ path: 'filters.sourceStatuses', code: 'invalid_value' });
  }
  if (!Array.isArray(request.filters.versionStatuses) || request.filters.versionStatuses.length < 1 || request.filters.versionStatuses.some((item) => !isEnumValue(KNOWLEDGE_VERSION_STATUSES, item))) {
    errors.push({ path: 'filters.versionStatuses', code: 'invalid_value' });
  }
  if (request.filters.languages !== undefined && (request.filters.languages.length < 1 || request.filters.languages.length > 8 || request.filters.languages.some((item) => !LANGUAGE.test(item)))) {
    errors.push({ path: 'filters.languages', code: 'invalid_value' });
  }
  if (request.filters.jurisdictions !== undefined && (request.filters.jurisdictions.length < 1 || request.filters.jurisdictions.length > 16 || request.filters.jurisdictions.some((item) => !JURISDICTION.test(item)))) {
    errors.push({ path: 'filters.jurisdictions', code: 'invalid_value' });
  }
  if (!['current', 'current_or_unknown', 'any'].includes(request.filters.freshness)) errors.push({ path: 'filters.freshness', code: 'invalid_value' });
  if (!isTimestamp(request.filters.asOf)) errors.push({ path: 'filters.asOf', code: 'invalid_value' });
  return errors;
}
