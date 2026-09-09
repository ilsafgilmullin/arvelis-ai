# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-10.

Travel Product Pivot остаётся текущим продуктовым направлением. ARVELIS AI на текущем этапе — полностью бесплатный user-facing сервис; billing/subscriptions/paywall не проектируются.

## Закрытые stacked layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1 — Draft PR #28, green, not merged;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29, green, not merged;
- [x] Transport Normalized Route Contract V1 — Draft PR #30, green, not merged;
- [x] Transport Provider Strategy & Adapter Foundation V1 — Draft PR #31, green, not merged;
- [x] Yandex Rasp Live Adapter V1 — Draft PR #32, green, not merged; production key not activated;
- [x] Map Provider Foundation & Route Map V1 — Draft PR #33, green, not merged; no real map provider;
- [x] Legal Sources & Travel Legal Foundation V1 — Draft PR #34, green, not merged; no real Legal provider;
- [x] ARVELIS AI Engine & Knowledge Foundation V1 — Draft PR #35, green, not merged; no real model/runtime activation.

## Current checkpoint — Retrieval & Knowledge Ingestion Foundation V1

Branch: `feat/travel-retrieval-knowledge-ingestion-v1`  
Base: `feat/travel-ai-knowledge-foundation-v1` / Draft PR #35.

Implemented scope:

- [x] dated AI/RAG stack decision in `docs/07_DECISIONS.md`;
- [x] source registry contracts;
- [x] document/version/chunk contracts;
- [x] source type / rights / status / jurisdiction / language metadata;
- [x] fetched/verified/effective timestamps;
- [x] SHA-256 normalized content hashing;
- [x] namespace-scoped document-version deduplication;
- [x] concurrent duplicate handling;
- [x] ingestion lifecycle service;
- [x] embedding port without production activation;
- [x] PostgreSQL repository boundary;
- [x] `pgvector` storage with `vector(1024)`;
- [x] strict Global vs account namespace isolation;
- [x] composite PK/FK namespace isolation in PostgreSQL;
- [x] global rights fail-closed policy;
- [x] bounded retrieval;
- [x] source/version/language/jurisdiction/freshness filters;
- [x] existing `KnowledgeRetriever` adapter;
- [x] additive `003_knowledge_retrieval_foundation.sql` migration;
- [x] signal-bearing in-memory Retrieval/Knowledge gate;
- [x] signal-bearing PostgreSQL/pgvector migration/repository/isolation gate;
- [x] CI PostgreSQL image switched to PostgreSQL 18 + pgvector;
- [x] no crawler / no automatic external ingestion;
- [x] no production embedding/model activation;
- [x] README / Architecture / Roadmap / Security synchronization;
- [x] dedicated `docs/52_RETRIEVAL_KNOWLEDGE_INGESTION_FOUNDATION_V1.md`.

### Retrieval V1 policy

- storage: existing PostgreSQL + pgvector, no separate vector DB;
- embedding dimension V1: 1024;
- no ANN index yet; bounded exact cosine search is used until real corpus/performance measurements justify index parameters;
- default AI retrieval: `global + authenticated account`, active sources, ready versions, Russian locale filters and `current_or_unknown` freshness;
- Global Knowledge accepts only explicitly `public`/`licensed` ingestion;
- account Knowledge never becomes Global Knowledge implicitly;
- Trip/documents/chat are not training data and are not automatically ingested globally.

### Closure criterion

Retrieval V1 is CLOSED only when:

1. stacked Draft PR targets `feat/travel-ai-knowledge-foundation-v1`;
2. exact final documentation HEAD receives PR-triggered CI;
3. `validate` is PASS;
4. `postgres-compat` is PASS on PostgreSQL 18 + pgvector, including migration `003` and repository/isolation gate;
5. no production model/embedding/crawler/credentials are activated.

## Next approved slice — Qwen Runtime Adapter & AI Evaluation V1

Start automatically only after Retrieval V1 is fully green and CLOSED.

Scope:

- [ ] adapter implementing existing `AiModelRuntime`;
- [ ] OpenAI-compatible vLLM protocol mapping;
- [ ] Qwen-specific/runtime-specific code remains inside adapter layer, not `AiGateway`;
- [ ] structured output mapping;
- [ ] tool-calling mapping;
- [ ] cancellation and bounded timeout behavior;
- [ ] untrusted runtime-response validation before Gateway use;
- [ ] golden semantic evaluation fixtures/harness;
- [ ] coverage for structured claims and protected-fact behavior through the existing Gateway;
- [ ] no production GPU/runtime deployment.

Local `llama.cpp` may remain a future/dev-compatible runtime boundary but is not required as a production backend.

### Qwen checkpoint closure

Qwen Runtime/Evaluation V1 may be called green only after its own signal-bearing adapter/evaluation tests, regression suite and stacked Draft PR CI pass on the exact final HEAD.

## Real STOP boundary after Qwen Runtime/Evaluation

Stop before:

1. production GPU/runtime provisioning;
2. downloading/placing production model weights;
3. production model credentials/endpoints;
4. paid AI APIs;
5. production embedding activation;
6. automated external Knowledge ingestion;
7. production deployment;
8. destructive migrations;
9. merge to `main`.

Further deployment requires separate explicit approval.

## Later roadmap — not started

- production runtime/GPU topology;
- production Knowledge source approval and ingestion operations;
- retention/refresh/deletion policy for Knowledge;
- reranker decision based on evaluation;
- Budget provider inputs / Currency contract;
- real Legal source adapters;
- real Map adapter/provider activation;
- Stay/Weather integrations;
- Trip Book export/generation;
- Live Companion;
- Safe/emergency capabilities.
