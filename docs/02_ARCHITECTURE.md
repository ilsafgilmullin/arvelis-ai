# ARVELIS AI — архитектура

**Актуальность:** Retrieval & Knowledge Ingestion Foundation V1, 2026-09-10.

## Core invariants

- `Trip` remains the core product aggregate;
- UI, domain, persistence, orchestration, retrieval, tools and external-provider adapters are separate layers;
- authenticated server session is authoritative for ownership;
- external/provider/model/retrieval output is untrusted until deterministic validation;
- external facts require provenance and freshness;
- provider/model-specific IDs, terms, quotas and credentials do not enter `Trip`;
- secrets stay server-side;
- no mock/fake data is presented as real provider output;
- model inference is never promoted to an authoritative protected external fact by itself;
- private account Knowledge never becomes Global Knowledge implicitly;
- user Trips, documents and conversations are not training data by default.

## Closed lower layers

- Travel UI V2;
- Server-side Trip Persistence & API V1;
- Plan Real-Data Contract & AI Orchestration Policy V1;
- Transport Normalized Route Contract V1;
- Transport Provider Strategy & Adapter Foundation V1;
- Yandex Rasp Live Adapter V1 — implementation closed, production key not activated;
- Map Provider Foundation & Route Map V1 — Draft PR #33, green, no real map provider;
- Legal Sources & Travel Legal Foundation V1 — Draft PR #34, green, no real Legal provider;
- ARVELIS AI Engine & Knowledge Foundation V1 — Draft PR #35, provider-neutral Gateway/runtime/retriever/tool boundaries, no real model activation.

## AI/RAG stack decision

Current approved direction:

- primary model candidate V1: `Qwen3-8B`;
- runtime boundary: OpenAI-compatible `vLLM`;
- local development adapter may support `llama.cpp`;
- embedding V1: `Qwen3-Embedding-0.6B`;
- reranker disabled;
- retrieval storage: existing PostgreSQL + `pgvector`;
- no separate vector database;
- Qwen/vLLM-specific logic must remain outside `AiGateway`.

This is an architecture/runtime direction, not a production deployment approval.

## Existing AI Engine boundary

`AiGateway` remains the provider-neutral orchestration layer. `AiModelRuntime`, `KnowledgeRetriever` and tool handlers are injected interfaces.

The Gateway:

- receives bounded structured input;
- keeps authenticated account scope server-side;
- requires an already-authorized Trip ID for trip-scoped execution;
- validates retriever/model/tool output;
- exposes only registered allowlisted tools;
- supports global timeout/cancellation;
- enforces protected-fact evidence policy;
- keeps prompt/raw evidence/secrets out of operational audit metadata.

The current Retrieval slice does not place Qwen, vLLM, pgvector SQL or embedding-model-specific behavior into `AiGateway`.

## Retrieval & Knowledge Ingestion Foundation V1

### Main boundaries

- `src/travel/knowledgeIngestionContracts.ts` — source/document/version/chunk/search contracts and fail-closed validation;
- `server/travel/knowledgeEmbeddingPort.ts` — embedding provider boundary;
- `server/travel/knowledgeRepository.ts` — persistence/search repository boundary;
- `server/travel/knowledgeIngestionService.ts` — normalization, content hashing, deduplication and ingestion lifecycle;
- `server/persistence/postgres/knowledgeRepository.ts` — PostgreSQL/pgvector repository implementation;
- `server/travel/postgresKnowledgeRetriever.ts` — adapter from repository+embedding port to existing `KnowledgeRetriever`;
- `server/db/migrations/003_knowledge_retrieval_foundation.sql` — additive PostgreSQL/pgvector schema.

No crawler, external source downloader, production embedding runtime or production model runtime is connected.

### Namespace model

Knowledge namespace is explicit:

- `{ kind: 'global' }`;
- `{ kind: 'account', accountId }`.

At the PostgreSQL layer this maps to `namespace_kind + namespace_key` and is included in primary/foreign keys for source → document → version → chunk relationships.

Consequences:

- a document/version/chunk from account A cannot be linked to a source from account B;
- retrieval for account A can use only Global Knowledge plus account A Knowledge;
- account B Knowledge is not addressable by the account A repository request;
- global rows have no `account_id`;
- account rows reference an existing `auth_accounts(id)`;
- Global Knowledge cannot contain `source_type=user` or `rights_status=user_owned`.

Application validation mirrors these database constraints, so namespace errors fail before persistence when possible and again at the database boundary if bypassed.

### Source registry / rights

Source metadata includes:

- source type: `official | editorial | user`;
- rights: `public | licensed | user_owned | restricted | unknown`;
- source status: `pending | active | disabled | revoked`;
- jurisdiction;
- language;
- optional canonical HTTPS URL;
- created/updated timestamps.

Ingestion accepts only active sources. Global ingestion additionally requires explicit `public` or `licensed` rights. This foundation does not infer rights from URL/domain/source type.

### Document/version/chunk lifecycle

Documents have stable IDs inside a namespace. Each document version records:

- SHA-256 normalized content hash;
- byte length;
- lifecycle status `processing | ready | failed | superseded | quarantined`;
- `fetchedAt`;
- `verifiedAt`;
- `effectiveFrom`;
- `effectiveUntil`;
- creation timestamp.

Chunks record:

- source/document/version references;
- ordinal;
- fact domain;
- jurisdiction/language;
- normalized text;
- SHA-256 text hash;
- embedding status/model ID;
- optional `vector(1024)` embedding.

### Content hashing / deduplication

Content is normalized to NFC, LF line endings and trimmed before SHA-256 hashing.

Document-version uniqueness is scoped to:

`namespace_kind + namespace_key + document_id + content_hash`.

Therefore:

- repeated identical content for the same document in the same namespace is deduplicated;
- the same bytes in another account namespace remain independent;
- concurrent duplicate ingestion is resolved by the unique constraint and repository/service retry-to-existing lookup rather than by creating a second version.

### Embedding boundary

`KnowledgeEmbeddingPort` declares a stable model ID, dimensions and batch `embed()` operation with `AbortSignal`.

Knowledge V1 dimension is `1024`, matching the approved Qwen3-Embedding-0.6B target. The model is **not activated** in this slice.

Without an embedding port, ingestion persists chunks as `embeddingStatus: pending` and does not invent vectors.

### PostgreSQL / pgvector

Migration `003_knowledge_retrieval_foundation.sql` is strictly additive relative to existing `001` and `002` migrations.

It:

- runs `CREATE EXTENSION IF NOT EXISTS vector`;
- creates Knowledge tables and constraints;
- uses `embedding vector(1024)`;
- adds metadata indexes for namespace/status/language/jurisdiction/freshness filtering;
- does not add an approximate nearest-neighbor index yet.

The V1 repository uses bounded exact cosine similarity (`1 - embedding <=> query`) so correctness/isolation can be verified before selecting ANN parameters from real data volumes.

### Retrieval policy

`KnowledgeSearchRequest` is bounded and validates:

- one or two namespaces, with at most one account namespace;
- exact 1024-dimensional finite query vector;
- maximum result count 20;
- source statuses;
- version statuses;
- language filters;
- jurisdiction filters;
- freshness mode;
- explicit `asOf` timestamp.

Default `PostgresKnowledgeRetriever` uses:

- Global + authenticated account namespace;
- active sources;
- ready versions;
- `ru-RU | ru` for Russian locale;
- `current_or_unknown` freshness;
- maximum 12 hits.

Repository output is normalized back into the existing `KnowledgeRetrievalResult` contract and validated again before becoming Gateway evidence.

### Freshness semantics

Freshness is source/version metadata, not retrieval time.

- `effectiveUntil >= asOf` can satisfy current freshness;
- missing `effectiveUntil` is unknown;
- expired versions fail `current` and `current_or_unknown` filters as defined by repository policy;
- `fetchedAt`/`verifiedAt` are provenance timestamps and do not by themselves prove current legal/provider validity.

RAG evidence still cannot authorize protected external facts that require normalized Transport/Map/Legal tools.

## Data-use boundary

This foundation does not:

- copy Trip records into Knowledge automatically;
- copy user chat/conversation history into Knowledge automatically;
- promote private account documents to Global Knowledge;
- train or fine-tune a model on user data;
- send private Knowledge to external model/embedding providers because no real provider is connected.

Any future ingestion from user documents requires explicit product/security/consent/retention rules.

## Signal-bearing verification

Application gate:

- namespace validation/isolation;
- source/version/deduplication lifecycle;
- malformed embedding fail-closed;
- bounded retrieval and normalized adapter output.

PostgreSQL/pgvector PR gate:

- migration chain `001 → 002 → 003`;
- extension/vector compatibility on PostgreSQL 18;
- exact `vector(1024)` repository search;
- source/status/language/jurisdiction/freshness filtering;
- cross-account isolation at SQL/FK boundary;
- DB-backed content deduplication compatibility.

Existing Plan/Transport/Map/Legal/Yandex/Trip/AI Engine regressions remain required.

## Retrieval V1 closure

Retrieval V1 is CLOSED only when its stacked Draft PR targets `feat/travel-ai-knowledge-foundation-v1` and both PR-triggered jobs are green on the exact final documentation HEAD:

- `validate`;
- `postgres-compat` with PostgreSQL 18 + pgvector.

After closure, the next approved slice is `Qwen Runtime Adapter & AI Evaluation V1`.

## STOP boundary after Qwen evaluation

No real production GPU/runtime deployment, model weights download, production credentials, paid AI API, automatic external ingestion, production deployment, destructive migration or merge to `main` is authorized.
