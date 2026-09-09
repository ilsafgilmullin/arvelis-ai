# ARVELIS AI — безопасность

**Актуальность:** Retrieval & Knowledge Ingestion Foundation V1 / бесплатная user-facing модель, 2026-09-10.

## Global invariants

- Account/Session and Trip ownership are server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider/model secrets are server-side only;
- external provider, retriever, tool and model output is untrusted input;
- provider/model-specific credentials and IDs do not enter `Trip`;
- no provider response, model prompt, raw evidence payload, auth secret, document or payment data is logged by default;
- billing/subscriptions/paywall remain outside Travel Domain;
- no fake/model-generated external fact is promoted to authoritative data;
- private account Knowledge and Global Knowledge are different security namespaces;
- user Trips, documents and conversation history are not training data by default and are not automatically promoted into Global Knowledge.

## Existing AI Gateway boundary

`AiGateway` remains provider-neutral. Authenticated account scope is held in `AiGatewayServerContext` and is not exposed to `AiModelRuntime` input.

Trip-scoped execution requires an already-authorized Trip ID. Missing/invalid authorization fails before model execution.

The Gateway does not contain Qwen/vLLM-specific code and this Retrieval slice does not activate a real model runtime.

## Knowledge namespace isolation

Knowledge namespace is explicit:

- `global`;
- `account:<accountId>`.

PostgreSQL stores namespace identity in `namespace_kind + namespace_key`, and those columns participate in source/document/version/chunk primary and foreign keys.

Security properties:

- account A cannot reference account B source/document/version/chunk through valid FK relations;
- account A retrieval cannot request a second account namespace;
- Global rows contain no account ID;
- account rows reference an existing server account;
- application validation rejects malformed/duplicate/multi-account namespace requests;
- PostgreSQL constraints remain a second fail-closed boundary if application validation is bypassed.

Default Gateway retrieval is restricted to `global + authenticated account`.

## Global Knowledge rights boundary

Global Knowledge must not silently absorb user/private content.

- global source cannot be `sourceType=user`;
- global source cannot be `rights=user_owned`;
- ingestion service requires explicit `public` or `licensed` rights for Global Knowledge;
- `restricted` or `unknown` rights are rejected for Global ingestion;
- source type alone does not prove rights;
- URL presence does not imply permission to ingest.

No crawler or automatic external importer exists in Retrieval V1.

## Source / document / version validation

Source metadata is bounded and validated for:

- source type;
- rights;
- lifecycle status;
- jurisdiction;
- language;
- optional HTTPS canonical URL;
- timestamps.

Document versions record:

- normalized SHA-256 content hash;
- size;
- lifecycle status;
- fetched/verified timestamps;
- effective date range.

Chunks record bounded text, domain, jurisdiction/language, SHA-256 hash and embedding lifecycle state.

Malformed metadata fails closed before trusted persistence/use.

## Deduplication security/data-integrity policy

Document content is normalized before hashing (`NFC`, normalized line endings, trim) and SHA-256 is calculated server-side.

Deduplication key is scoped to:

`namespace + document + contentHash`.

This prevents a private account document from becoming deduplicated against or aliased to another account's document purely because its bytes are identical.

Concurrent same-namespace duplicate ingestion is resolved through a database unique constraint plus lookup of the authoritative existing version. The service does not create a second canonical version after a race.

## Embedding boundary

`KnowledgeEmbeddingPort` is an injected server-side interface.

- expected V1 dimension: 1024;
- every returned value must be finite;
- batch size must match request size;
- invalid embedding response fails closed;
- without an embedding port, chunks remain `pending` and no fake vector is generated;
- Qwen3-Embedding-0.6B is approved as the target V1 embedding model but is not activated here;
- no embedding credentials or production endpoint are configured.

## PostgreSQL / pgvector boundary

Migration `003_knowledge_retrieval_foundation.sql` is additive only.

It runs `CREATE EXTENSION IF NOT EXISTS vector` and creates new Knowledge tables. Existing migration files `001` and `002` remain immutable/checksummed.

`embedding vector(1024)` is nullable and must be present only when `embedding_status=ready`.

No approximate ANN index is created in V1. Retrieval uses bounded exact cosine similarity so isolation/filter correctness is validated before future performance tuning.

## Retrieval filtering / freshness

Search requests validate and bound:

- namespaces;
- 1024-dimensional query embedding;
- maximum result count;
- source status;
- version status;
- languages;
- jurisdictions;
- freshness mode;
- explicit `asOf` timestamp.

Default AI retrieval accepts only active sources and ready versions.

Freshness rules do not treat retrieval time as proof of validity:

- `effectiveUntil` in the future/present can be current;
- missing `effectiveUntil` is unknown;
- expired content is filtered out when current/current-or-unknown policy requires it;
- `fetchedAt` and `verifiedAt` are provenance metadata, not a universal authority guarantee.

## Protected factual domains

RAG does not bypass existing tool authority policy.

Protected domains remain:

- transport schedule;
- price;
- availability;
- map route;
- legal;
- weather.

A retrieved chunk, even from an official source, cannot by itself authorize Legal/Transport/Map protected facts where the Gateway requires matching current normalized tool evidence.

## Data-use/privacy boundary

Retrieval V1 does not implement:

- automatic Trip → Knowledge ingestion;
- automatic chat/conversation → Knowledge ingestion;
- automatic user-document → Global Knowledge promotion;
- training or fine-tuning on user data;
- outbound sending of account Knowledge to a real model/embedding service;
- crawler/download of external sources.

A future user-document ingestion feature requires an explicit consent, purpose, retention, deletion, access-control and provider-transfer decision before activation.

## Bounded execution / denial-of-service controls

Foundation bounds include:

- document max size;
- chunk count/text size;
- embedding dimensions/batch shape;
- search result limit;
- maximum namespace count;
- source/language/jurisdiction filter sizes;
- existing Gateway evidence/tool limits;
- timeout/cancellation through the embedding/runtime interfaces where applicable.

## Audit / observability

Operational logs/audit must not contain raw source documents, chunk text, user private content, embeddings, prompts, credentials, cookies or model response bodies by default.

Allowed operational metadata may include opaque IDs, lifecycle status, timing, counts and validation/error codes when needed.

## Signal-bearing security tests

`test:retrieval-knowledge-foundation` covers:

- namespace validation/isolation;
- rights fail-closed behavior;
- source/version/dedup lifecycle;
- embedding shape failure;
- bounded retrieval/normalization.

`test:knowledge-postgres-foundation` on PR CI covers:

- PostgreSQL 18 + pgvector migration compatibility;
- `vector(1024)` storage/search;
- SQL/FK cross-account isolation;
- status/language/jurisdiction/freshness filtering;
- database-backed dedup compatibility.

Existing AI Engine, Plan, Transport, Map, Legal, Yandex and Trip security regressions remain required.

## Runtime/evaluation next boundary

After Retrieval V1 closes, Qwen Runtime Adapter & AI Evaluation V1 may implement an OpenAI-compatible vLLM adapter only through the existing `AiModelRuntime` interface.

Qwen/vLLM-specific response parsing, structured-output mapping and tool-call mapping must stay inside the adapter. `AiGateway` remains policy/vendor-neutral.

Golden semantic evaluation must run before any real model deployment so syntactically valid responses are not treated as semantically safe merely because they satisfy JSON shape.

## Production / STOP boundaries

No production GPU, production model weights, production runtime endpoint, model credential, paid AI API, production embedding activation, crawler or automatic external Knowledge ingestion is authorized.

No merge to `main`, production deployment or destructive migration is authorized by this slice.
