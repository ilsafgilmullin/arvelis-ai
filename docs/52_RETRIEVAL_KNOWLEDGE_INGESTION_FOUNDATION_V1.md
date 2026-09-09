# ARVELIS Retrieval & Knowledge Ingestion Foundation V1

**Date:** 2026-09-10  
**Branch:** `feat/travel-retrieval-knowledge-ingestion-v1`  
**Base:** `feat/travel-ai-knowledge-foundation-v1` / Draft PR #35  
**Starting implementation HEAD:** `be2db701f52d7243e486fd6a1cdffa187472a6dc`

## Purpose

This slice establishes a production-shaped but non-production Knowledge ingestion/retrieval foundation for future ARVELIS RAG without activating a real model, embedding runtime, crawler or external source set.

The existing provider-neutral `AiGateway`, `AiModelRuntime` and `KnowledgeRetriever` boundaries remain authoritative. Retrieval persistence is added behind those ports rather than moving PostgreSQL, pgvector, Qwen or vLLM details into the Gateway.

## Approved AI/RAG direction

- primary model candidate V1: `Qwen3-8B`;
- runtime boundary: OpenAI-compatible `vLLM`;
- local development runtime may support `llama.cpp` through a separate adapter;
- embedding V1: `Qwen3-Embedding-0.6B`;
- reranker: disabled;
- retrieval storage: existing PostgreSQL + `pgvector`;
- no separate vector DB;
- no production model/runtime or embedding activation in this slice.

The dated decision is recorded in `docs/07_DECISIONS.md` without deleting prior historical decisions.

## Implemented contracts

### Source registry

`KnowledgeRegistrySource` stores:

- stable ID;
- namespace;
- title/publisher;
- `official | editorial | user` source type;
- `public | licensed | user_owned | restricted | unknown` rights;
- `pending | active | disabled | revoked` status;
- jurisdiction;
- language;
- optional canonical HTTPS URL;
- created/updated timestamps.

### Documents and versions

A `KnowledgeDocument` is a stable logical document inside a namespace/source.

A `KnowledgeDocumentVersion` records:

- source/document linkage;
- namespace;
- normalized SHA-256 content hash;
- byte length;
- lifecycle status;
- `fetchedAt`;
- `verifiedAt`;
- `effectiveFrom`;
- `effectiveUntil`;
- creation timestamp.

Version states are:

`processing | ready | failed | superseded | quarantined`.

### Chunks

Each `KnowledgeIngestionChunk` records:

- source/document/version identity;
- namespace;
- ordinal;
- AI fact domain;
- jurisdiction;
- language;
- bounded text;
- SHA-256 chunk hash;
- embedding status;
- optional embedding model ID;
- creation timestamp.

Embedding states are:

`pending | ready | failed | disabled`.

## Namespace isolation

Knowledge namespaces are explicit and non-interchangeable:

- Global: `{ kind: 'global' }`;
- Private: `{ kind: 'account', accountId }`.

### Application boundary

Validation rejects:

- malformed account IDs;
- duplicate namespace entries;
- more than one account namespace in one search;
- user-owned/user-type content in Global Knowledge;
- source/document/version/chunk namespace mismatches.

Default AI retrieval constructs namespaces server-side as:

`global + authenticated account`.

The account ID comes from server context, not model output or client-provided retrieval filters.

### PostgreSQL boundary

`namespace_kind` + `namespace_key` participate in primary/foreign keys across:

- `knowledge_sources`;
- `knowledge_documents`;
- `knowledge_document_versions`;
- `knowledge_chunks`.

This prevents a valid relational link across accounts. Account-scoped sources also reference `auth_accounts(id)`.

Global rows require `namespace_key='global'` and `account_id IS NULL`; account rows require `namespace_key=account_id`.

## Rights / promotion policy

Global Knowledge is not a destination for private user content.

Global ingestion requires:

- source status `active`;
- explicit rights `public` or `licensed`;
- source type not `user`;
- rights not `user_owned`.

`restricted` and `unknown` rights fail closed for Global ingestion.

No URL/domain/source-type heuristic grants ingestion rights.

Private account Knowledge remains private unless a future explicit, authorized promotion workflow is designed. This slice implements no such workflow.

## Content hashing / deduplication

Document content is normalized before hashing:

1. Unicode NFC;
2. CRLF/CR normalized to LF;
3. leading/trailing whitespace trimmed.

SHA-256 is then calculated server-side.

Document-version uniqueness is:

`namespace_kind + namespace_key + document_id + content_hash`.

Consequences:

- same content re-ingested for the same document/account deduplicates;
- identical bytes in different accounts remain independent records;
- identical bytes in Global vs account Knowledge remain independent;
- concurrent inserts are protected by the PostgreSQL uniqueness constraint;
- on a uniqueness race the service re-reads and returns the already-existing authoritative version instead of creating a second version.

## Ingestion lifecycle

`KnowledgeIngestionService` performs:

1. source validation;
2. active-status / Global-rights policy;
3. bounded content/chunk validation;
4. source registration;
5. SHA-256 dedup lookup;
6. version/chunk contract construction;
7. optional embedding through `KnowledgeEmbeddingPort`;
8. embedding batch validation;
9. repository atomic save;
10. race-safe duplicate recovery.

Without a configured embedding port, chunks are stored as `pending` and no fabricated embedding is created.

No real external source fetch happens in the service; callers must already possess authorized content.

## Embedding boundary

`KnowledgeEmbeddingPort` is provider-neutral:

- stable `id`;
- fixed `dimensions`;
- batch `embed(inputs, AbortSignal)`.

Knowledge V1 expects 1024 dimensions, matching the approved Qwen3-Embedding-0.6B target.

The target model is not downloaded, started or called in this slice.

Returned embedding batches fail closed when:

- batch count differs;
- vector dimension differs;
- any vector component is non-finite.

## Additive migration 003

File:

`server/db/migrations/003_knowledge_retrieval_foundation.sql`

Migration properties:

- additive only;
- `001_auth_foundation.sql` unchanged;
- `002_travel_trip_persistence.sql` unchanged;
- included in the existing checksum migration runner;
- `CREATE EXTENSION IF NOT EXISTS vector`;
- creates Knowledge source/document/version/chunk tables;
- uses `embedding vector(1024)`;
- preserves namespace isolation with composite keys;
- stores rights/status/jurisdiction/language/freshness metadata;
- creates metadata/filter indexes only;
- does not create an HNSW/IVFFlat index in V1.

The absence of an ANN index is deliberate. Exact bounded cosine retrieval is preferred until a real corpus provides enough evidence to select index type/parameters and validate recall/performance trade-offs.

## PostgreSQL repository

`PostgresKnowledgeRepository` implements the existing `KnowledgeRepository` boundary.

It provides:

- source registration/update;
- version lookup by namespace/document/content hash;
- transactional source/document/version/chunk save;
- race-safe uniqueness handling;
- bounded pgvector similarity search with filters.

Embedding serialization is generated only from already validated finite 1024-dimensional arrays.

## Retrieval filtering

`KnowledgeSearchRequest` requires:

- one or two namespaces;
- at most one account namespace;
- exact 1024-dimensional query vector;
- `limit` between 1 and 20;
- non-empty source statuses;
- non-empty version statuses;
- optional language filters;
- optional jurisdiction filters;
- freshness mode;
- explicit `asOf` timestamp.

Freshness modes:

- `current`;
- `current_or_unknown`;
- `any`.

Default `PostgresKnowledgeRetriever` uses:

- Global + authenticated account;
- source status `active`;
- version status `ready`;
- languages `ru-RU | ru` for `ru-RU` locale;
- `current_or_unknown`;
- maximum 12 hits.

Repository results are normalized into the pre-existing AI Engine `KnowledgeRetrievalResult` and validated before they become `AiGateway` evidence.

## Freshness semantics

The foundation intentionally separates:

- `fetchedAt` — when content was fetched/received;
- `verifiedAt` — when source/content was verified by the ingestion workflow;
- `effectiveFrom` / `effectiveUntil` — source applicability window.

Retrieval time is not treated as source validity.

`current_or_unknown` includes versions with no explicit `effectiveUntil` but excludes explicitly expired versions. `current` requires a non-expired effective window according to repository filtering.

For protected facts, Knowledge freshness still does not replace normalized provider/tool authority requirements.

## Protected-fact compatibility

Retrieval/RAG evidence does not weaken the existing AI Engine policies:

- price/schedule/availability authority requires `transport.search` evidence;
- map facts require `map.route` evidence;
- Legal authority requires current official HTTPS evidence from `legal.check`;
- Weather has no authoritative tool in the current foundation.

An official Knowledge chunk cannot bypass those boundaries.

## Data-use boundary

Retrieval V1 explicitly does not:

- automatically ingest Trip data;
- automatically ingest conversations/messages;
- automatically ingest account documents into Global Knowledge;
- use user data to train/fine-tune models;
- expose private Knowledge to another account;
- send private Knowledge to a production external AI/embedding service.

No automatic external crawler/indexer is connected.

## Signal-bearing tests

### Application foundation gate

`npm run test:retrieval-knowledge-foundation`

Covers:

- Global/account namespace validation;
- Global rights fail-closed behavior;
- version/content dedup semantics;
- cross-account dedup separation;
- invalid embedding response rejection;
- bounded retrieval adapter behavior.

### PostgreSQL/pgvector gate

`npm run test:knowledge-postgres-foundation`

Runs in PR CI against `pgvector/pgvector:0.8.6-pg18` and covers:

- migration `003` compatibility;
- pgvector extension and `vector(1024)` storage;
- repository persistence;
- exact cosine retrieval;
- namespace isolation;
- SQL/FK cross-account rejection;
- status/language/jurisdiction/freshness filters;
- database-backed dedup compatibility.

Lower-layer AI Engine/Plan/Transport/Map/Legal/Yandex/Trip regressions remain mandatory.

## CI / closure

Retrieval V1 is CLOSED only after a stacked Draft PR with:

- head `feat/travel-retrieval-knowledge-ingestion-v1`;
- base `feat/travel-ai-knowledge-foundation-v1`;
- final PR-triggered `validate` PASS;
- final PR-triggered `postgres-compat` PASS;
- both results on the same exact final documentation HEAD.

Push-only CI is not sufficient for closure because PostgreSQL compatibility runs on PR/workflow-dispatch only.

## Non-goals / STOP boundaries

This slice does not include:

- production Qwen runtime;
- production GPU provisioning;
- production model weights download;
- model/embedding credentials;
- paid AI APIs;
- production embedding activation;
- reranker;
- separate vector DB;
- crawler/automatic external source ingestion;
- production Knowledge source approval;
- production deploy;
- destructive migrations;
- merge to `main`.

After full green closure, the next approved slice is `Qwen Runtime Adapter & AI Evaluation V1`. Real model deployment remains a STOP boundary after that evaluation checkpoint.
