# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-12.

Travel Product Pivot остаётся текущим направлением. ARVELIS AI на текущем этапе — полностью бесплатный user-facing сервис; billing/subscriptions/paywall не проектируются.

## Закрытые stacked layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1 — Draft PR #28;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29;
- [x] Transport Normalized Route Contract V1 — Draft PR #30;
- [x] Transport Provider Strategy & Adapter Foundation V1 — Draft PR #31;
- [x] Yandex Rasp Live Adapter V1 — Draft PR #32, production key not activated;
- [x] Map Provider Foundation & Route Map V1 — Draft PR #33;
- [x] Legal Sources & Travel Legal Foundation V1 — Draft PR #34;
- [x] ARVELIS AI Engine & Knowledge Foundation V1 — Draft PR #35;
- [x] Retrieval & Knowledge Ingestion Foundation V1 — Draft PR #36, PostgreSQL 18 + pgvector green;
- [x] Qwen Runtime Adapter & AI Evaluation V1 — Draft PR #37, final HEAD `b5685472efdaaea57e674911a852f0bf9bf7aa78`, green; no production model deployment.

## Current checkpoint — Free Local Qwen Live Evaluation V1

Branch:

`feat/travel-free-local-qwen-live-evaluation-v1`

Base:

`feat/travel-qwen-runtime-evaluation-v1` / Draft PR #37.

Truthful current status:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

### Engineering scope

- [x] keep `AiGateway` vendor-neutral and unchanged;
- [x] add separate development/evaluation `QwenLlamaCppRuntime` through existing `AiModelRuntime`;
- [x] preserve `QwenVllmRuntime` as future production-oriented runtime candidate;
- [x] enforce loopback-only llama.cpp endpoint;
- [x] reject every remote endpoint;
- [x] OpenAI-compatible `/v1/chat/completions` mapping;
- [x] system/user messages;
- [x] tools + tool choice;
- [x] strict JSON-schema structured answer mapping;
- [x] Qwen3 non-thinking metadata;
- [x] normal + reproducibility sampling profiles;
- [x] caller cancellation;
- [x] bounded timeout/output/body;
- [x] unknown/unavailable/malformed tool fail-closed;
- [x] free-form final answer fail-closed;
- [x] no heuristic output repair;
- [x] reuse existing `validateAiModelTurn`;
- [x] reuse `QWEN_GOLDEN_CASES` / `runQwenGoldenEvaluation()` rather than adding another evaluation framework;
- [x] add unknown-tool golden case;
- [x] deterministic synthetic Tool/Retrieval fixtures only;
- [x] explicit semantic-review verdict remains mandatory;
- [x] typed sanitized live report;
- [x] local raw-transcript directory gitignored;
- [x] explicit preflight/run CLI;
- [x] exactly one primary deterministic adapter gate;
- [x] no real GGUF in GitHub CI;
- [x] no new browser suite;
- [x] no database migration;
- [x] `.replit` unchanged;
- [x] no automatic model download/build/startup;
- [x] dedicated `docs/54_FREE_LOCAL_QWEN_LIVE_EVALUATION_V1.md`.

### Reproducibility identity

Pinned model:

- `Qwen/Qwen3-8B-GGUF`;
- revision `7c41481f57cb95916b40956ab2f0b139b296d974`;
- `Qwen3-8B-Q4_K_M.gguf`;
- SHA-256 `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`;
- size `5,027,783,488` bytes;
- Q4_K_M;
- Apache-2.0.

Pinned llama.cpp:

- release `b10902`;
- commit `df03399b885831b2a1603b3abb0d8c156808e363`.

Q4 qualification is not equivalent to the future BF16/vLLM baseline.

### Deterministic engineering gate

`npm run test:qwen-llamacpp-runtime` validates a loopback fake HTTP server path without GGUF:

- loopback-only configuration;
- remote rejection;
- request/thinking/schema/tool mapping;
- normal/reproducibility sampling;
- malformed/free-form responses;
- unknown/unavailable/malformed tool calls;
- timeout;
- cancellation;
- response-size bound;
- local metric capture;
- live-runner compilation;
- explicit CLI syntax.

The existing Qwen, AI, Retrieval, Yandex, Trip, server/browser/build regressions remain in `npm run check`.

Implementation run #733 on `a959d8b46c0922cc1359026301ec5681f976dffb` passed all of those gates before documentation synchronization. A later documentation-head PR run remains the final engineering checkpoint.

### Live-model qualification gate

The entire slice can be marked **CLOSED** only after all of the following actually occur on suitable free local compute:

1. preflight passes;
2. exact immutable GGUF is downloaded manually outside npm/Replit lifecycle;
3. actual file size and SHA-256 match the manifest;
4. pinned llama.cpp starts only on loopback with Jinja and reasoning disabled;
5. `/health` and `/v1/models` prove the expected local alias;
6. actual Qwen3-8B executes through `AiGateway → QwenLlamaCppRuntime`;
7. normal and reproducibility repeated golden runs complete;
8. schema and protected-fact results are captured;
9. semantic-coverage cases receive explicit review verdicts;
10. a sanitized live report is produced;
11. final report is `QUALIFIED` with no protected-fact violation.

One successful generation is never sufficient.

### Current live block

The current free environment inspected during this slice has approximately:

- 5.8 GiB total RAM;
- no swap;
- ~30 GiB free disk;
- no pinned `llama-server` installed.

Disk is sufficient, but RAM/runtime requirements are not. Therefore Qwen3-8B Q4 was not downloaded or executed. A smaller model was not substituted.

This is an expected valid checkpoint, not a test PASS:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

## Engineering closure criterion for current branch

Engineering implementation is ready after:

1. synchronized README/Architecture/Roadmap/Security/Decisions + doc 54;
2. stacked Draft PR targets `feat/travel-qwen-runtime-evaluation-v1`;
3. exact final documentation HEAD receives PR-triggered CI;
4. `validate` is PASS, including deterministic local adapter gate;
5. existing PostgreSQL/pgvector lower-layer PR regression remains PASS;
6. no paid or production infrastructure is activated.

This engineering closure does **not** imply live-model qualification.

## Next STOP boundary

Stop after Engineering Ready until suitable **free** compute for exact Qwen3-8B Q4 is available or the user explicitly changes the deployment/evaluation decision.

Do not automatically proceed to:

- paid GPU/cloud;
- paid inference provider;
- production model/runtime;
- public llama.cpp endpoint;
- production credentials;
- production embedding;
- crawler/Knowledge production ingestion;
- destructive migration;
- Trip Domain change;
- production deploy;
- merge to `main`.

## Later roadmap — not started

- real hash-verified free-local Qwen3-8B live qualification;
- BF16/vLLM controlled qualification on separately approved infrastructure;
- production runtime/GPU decision and rollout;
- production Knowledge source approval/operations;
- retention/refresh/deletion policy for Knowledge;
- reranker decision from measured evaluation;
- Budget/Currency providers;
- real Legal/Map/Stay/Weather integrations;
- Trip Book generation;
- Live Companion;
- Safe/emergency capabilities.
