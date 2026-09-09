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
- [x] Map Provider Foundation & Route Map V1 — Draft PR #33, green, not merged;
- [x] Legal Sources & Travel Legal Foundation V1 — Draft PR #34, green, not merged;
- [x] ARVELIS AI Engine & Knowledge Foundation V1 — Draft PR #35, green, not merged;
- [x] Retrieval & Knowledge Ingestion Foundation V1 — Draft PR #36, final HEAD `aab7f49c1dfc0909536e1afba7da84bcdf98be3d`, PR-triggered run #721 green including PostgreSQL 18 + pgvector.

## Current checkpoint — Qwen Runtime Adapter & AI Evaluation V1

Branch: `feat/travel-qwen-runtime-evaluation-v1`  
Base: `feat/travel-retrieval-knowledge-ingestion-v1` / Draft PR #36.

Implemented scope:

- [x] concrete adapter through existing `AiModelRuntime`;
- [x] OpenAI-compatible vLLM `/v1/chat/completions` mapping;
- [x] Qwen/vLLM-specific code isolated in adapter, not `AiGateway`;
- [x] strict endpoint/config validation;
- [x] remote HTTPS-only / loopback HTTP development policy;
- [x] structured-output JSON-schema mapping;
- [x] native OpenAI-style tool-call mapping;
- [x] stable ARVELIS tool ID ↔ runtime function name translation;
- [x] unknown/unavailable/malformed tool call fail-closed;
- [x] Qwen3 non-thinking request mode;
- [x] bounded sampling/max-token configuration;
- [x] caller cancellation propagation;
- [x] independent bounded adapter timeout;
- [x] non-2xx/malformed/oversized response rejection;
- [x] normalized `AiModelTurn` validation before Gateway use;
- [x] unchanged Gateway protected-fact validation;
- [x] two-round tool-backed price integration fixture through Gateway + Tool Registry;
- [x] golden semantic evaluation harness;
- [x] semantic coverage explicitly separated from JSON/schema success;
- [x] no production model/GPU/weights/credentials activation;
- [x] signal-bearing `test:qwen-runtime-evaluation` CI gate;
- [x] server runtime compilation of adapter/evaluation code;
- [x] dedicated `docs/53_QWEN_RUNTIME_ADAPTER_AI_EVALUATION_V1.md`;
- [x] README / Architecture / Roadmap / Security synchronization.

### Implementation verification

Initial run #722 reached the Qwen gate and found a strict TypeScript optional-property typing defect. It was fixed without changing runtime security semantics.

Push run #723 on implementation HEAD `d202c5632ecd923a8e0ce2e9d0f38e8214023d53` is fully green:

- dependency audit PASS;
- typecheck PASS;
- Plan/Transport/Map/Legal regressions PASS;
- AI Engine PASS;
- Retrieval/Knowledge PASS;
- Qwen Runtime/Evaluation PASS;
- Yandex PASS;
- Trip server PASS;
- server build PASS;
- server-backed Chromium happy-path PASS;
- frontend build PASS.

### Golden evaluation policy

Current deterministic harness cases:

1. general advice remains inference;
2. unsupported price is rejected;
3. tool-backed current price may become authoritative;
4. Knowledge-only Legal fact is rejected;
5. stale protected fact is rejected;
6. externally-checkable prose requires structured-claim coverage.

For semantic-coverage cases, an explicit `semanticCoveragePassed=true` is mandatory. Missing semantic verdict fails the release gate.

No live Qwen model has been executed yet; fixture success is not represented as live-model evaluation.

### Qwen checkpoint closure

Qwen Runtime Adapter & AI Evaluation V1 is CLOSED only when:

1. documentation is synchronized;
2. stacked Draft PR targets `feat/travel-retrieval-knowledge-ingestion-v1`;
3. PR-triggered `validate` is PASS on exact final documentation HEAD;
4. PR-triggered `postgres-compat` remains PASS on the same HEAD, preserving migrations `001→002→003`, Trip persistence and Knowledge pgvector regression;
5. no production runtime/model deployment or credential activation occurs.

## Mandatory STOP after Qwen Runtime/Evaluation

After green Qwen checkpoint do **not** proceed automatically into deployment.

Stop before:

1. production GPU provisioning;
2. actual vLLM server/runtime deployment;
3. model weights download/placement;
4. production model endpoint or credentials;
5. paid AI API;
6. production embedding activation;
7. automatic external Knowledge ingestion;
8. production deployment;
9. destructive migrations;
10. merge to `main`.

A future real-model deployment decision must separately approve runtime topology, model/version/licensing/checksum, network/auth policy, capacity/cost limits, live-model golden semantic evaluation, monitoring/rollback and privacy impact.

## Later roadmap — not started

- real GPU/runtime deployment;
- live Qwen semantic evaluation;
- production Knowledge source approval and ingestion operations;
- retention/refresh/deletion policy for Knowledge;
- reranker decision based on measured evaluation;
- Budget/Currency provider inputs;
- real Legal source adapters;
- real Map adapter/provider activation;
- Stay/Weather integrations;
- Trip Book export/generation;
- Live Companion;
- Safe/emergency capabilities.
