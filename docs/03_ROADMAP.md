# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-17, Project State Sync V1.

ARVELIS AI развивается как бесплатный user-facing **AI Travel Assistant**. Billing/subscriptions/paywall на текущем этапе не проектируются.

Главный принцип roadmap: закрывать последовательные проверяемые vertical slices и не активировать production provider/UI раньше, чем квалифицированы identity, authorization, evidence, freshness и fail-closed boundaries.

## Закрытые / квалифицированные stacked layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1;
- [x] Transport Normalized Route Contract V1;
- [x] Transport Provider Strategy & Adapter Foundation V1;
- [x] Yandex Rasp adapter/provider foundation — production activation остаётся выключенной;
- [x] Map Provider Foundation & Route Map V1;
- [x] Legal Sources & Travel Legal Foundation V1;
- [x] ARVELIS AI Engine & Knowledge Foundation V1;
- [x] Retrieval & Knowledge Ingestion Foundation V1 — PostgreSQL + pgvector compatibility;
- [x] Qwen Runtime Adapter & AI Evaluation V1;
- [x] real Qwen3-8B Q4_K_M controlled local evaluation;
- [x] Required Tool Routing V1 — server-side deterministic required transport routing;
- [x] Production Transport Search Contract V1 — controlled Qwen qualification;
- [x] Yandex Rasp Live Provider Integration V1 repository boundary — live E2E ещё не подтверждён;
- [x] authenticated Trip-bound Transport Runtime API Boundary V1;
- [x] Location Resolution Foundation V1;
- [x] Location Provider Strategy V1;
- [x] GeoNames Source Boundary V1;
- [x] GeoNames Controlled Ingestion Evaluation V1 — official RU snapshot evidence qualified.

## Текущий checkpoint

Parent before this documentation sync:

- Draft PR #44;
- branch `feat/travel-geonames-controlled-ingestion-eval-v1`;
- exact HEAD `ec28cd0dd6159a24c4c8c6a33da6f74be3cb8e52`;
- exact-head CI `35146640908` — SUCCESS.

GeoNames RU evaluation подтвердил, что dataset пригоден для следующего controlled internal-directory prototype, но также выявил существенную неоднозначность location names. Поэтому name-only auto-resolution запрещён.

## Pass 1 — Project State & Documentation Sync V1

Цель: убрать опасный documentation drift перед новым функциональным slice.

- [x] зафиксировать текущий exact parent checkpoint;
- [x] синхронизировать `00_PROJECT_CONTEXT`;
- [x] синхронизировать `03_ROADMAP`;
- [x] синхронизировать `06_MVP_GATES`;
- [x] добавить `64_PROJECT_STATE_SYNC_V1`;
- [ ] получить exact-head CI для documentation-sync branch/PR;
- [ ] не менять runtime/dependencies/migrations/secrets/activation flags.

## Pass 2 — Location Directory Persistence & Ranking Foundation V1

Следующий функциональный slice.

Обязательные результаты:

- provider-neutral durable ARVELIS location identity;
- source provenance/revision records;
- source external ID остаётся provenance, а не trusted browser/model identity;
- canonical location отдельно от source names/aliases;
- bounded normalized-name lookup;
- deterministic ranking inputs: requested type, country/admin context, population и другие явно утверждённые сигналы;
- ambiguity сохраняется, если данных недостаточно для однозначного выбора;
- no silent first-match behavior;
- refresh/revision semantics определены до production import;
- deterministic repository tests;
- никаких Routes UI/Yandex production activation.

Перед любым реальным persistent import отдельно проверяются migration shape, storage bounds, rollback/update semantics и лицензионная attribution boundary.

## Pass 3 — Trusted Location → Transport Provider Binding

После квалификации внутреннего directory:

- разрешать transport search только через trusted ARVELIS location identities;
- provider-specific codes хранить только в server-side binding layer;
- development и production bindings жёстко разделять;
- browser/model не используют provider code как ARVELIS identity;
- отсутствие binding должно давать typed unavailable/unresolved, а не guessed code.

## Pass 4 — Isolated Live Yandex Development Verification

Только после готовности trusted identity/binding path:

- использовать разрешённый development credential из защищённой среды;
- не копировать ключ в Git/PR/CI/chat;
- application production gates не включать;
- проверить bounded live request, attribution, normalization, timeout/cancellation и sanitized errors;
- зафиксировать evidence без credential/raw secret leakage.

Успешный provider smoke не является production activation.

## Pass 5 — Routes End-to-End V1

Пользовательский вертикальный сценарий:

`origin/destination text → Location Resolution → explicit disambiguation when needed → trusted ARVELIS IDs → provider binding → transport search → normalized validated response → attribution/freshness → Routes UI`.

До этого этапа Routes UI не должен показывать mock/fixture transport как live data.

## Integration checkpoint

После E2E Routes V1:

- аудит длинной stacked PR chain;
- проверка exact HEAD каждого required lower layer;
- актуализация PR descriptions;
- branch-protection/required-check verification;
- подготовка merge plan.

**Merge в `main` выполняется только после отдельного подтверждения пользователя.**

## Позднее — не начинать автоматически

- production BF16/vLLM/GPU topology;
- production model capacity/SLA/load qualification;
- production Knowledge ingestion operations;
- Stay/Hotel provider integration;
- Budget/Currency live providers;
- production Legal/Map/Weather integrations;
- Trip Book generation;
- Live Companion;
- Safe/emergency capabilities;
- billing/subscriptions;
- native mobile applications.

## Production readiness blockers

До production остаются как минимум:

- Location Directory persistence/ranking;
- trusted provider bindings;
- live transport E2E;
- production AI runtime/capacity;
- backup/recovery;
- monitoring/observability/incident operations;
- production privacy/legal/data-residency review;
- secrets/IAM hardening;
- physical mobile/accessibility acceptance;
- explicit release/rollback plan.

Текущий статус: **development / controlled qualification, не production-ready**.
