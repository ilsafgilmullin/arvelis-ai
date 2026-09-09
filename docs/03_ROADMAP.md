# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-09.

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
- [x] Legal Sources & Travel Legal Foundation V1 — Draft PR #34, green, not merged; no real Legal provider.

## Current checkpoint — ARVELIS AI Engine & Knowledge Foundation V1

Branch: `feat/travel-ai-knowledge-foundation-v1`  
Base: Legal V1 / `54f5d7b14bd12ec0d9da9c92eede79598664dbf7`

Implemented scope:

- [x] provider-neutral `AiGateway`;
- [x] model/runtime adapter boundary without selecting a vendor;
- [x] normalized Knowledge source/chunk/evidence contracts;
- [x] provider-neutral `KnowledgeRetriever` / RAG boundary;
- [x] allowlisted tool registry for `trip.read`, `transport.search`, `map.route`, `legal.check`;
- [x] server-stamped tool provenance;
- [x] structured model turns and structured final answer/claim validation;
- [x] protected-fact policy for schedule/price/availability/map/legal/weather;
- [x] current tool evidence required for protected authoritative facts;
- [x] official current HTTPS Legal tool evidence required for authoritative Legal facts;
- [x] Weather authoritative facts impossible in V1 because no Weather tool is approved;
- [x] account scope remains server-only and is not exposed to model runtime input;
- [x] bounded evidence and maximum two tool rounds;
- [x] global timeout/cancellation;
- [x] truthful `not_connected` without model runtime;
- [x] deterministic release/evaluation policy;
- [x] one signal-bearing AI/Knowledge business/security/evidence gate;
- [x] implementation push #704 PASS;
- [x] README documentation;
- [x] Architecture/Roadmap/Security documentation;
- [x] dedicated `docs/51_ARVELIS_AI_ENGINE_KNOWLEDGE_FOUNDATION_V1.md` planned as final documentation artifact.

Closure criterion:

- stacked Draft PR #35 must target `feat/travel-legal-sources-foundation-v1`;
- final PR-triggered `validate` and PostgreSQL lower-layer regression must PASS on the same documentation head;
- after that the slice is CLOSED with no runtime/provider activation.

No real model/runtime provider, embedding provider, vector DB or production knowledge ingestion is connected.

## Hard factual policy

A model is not an authoritative source for:

- prices;
- transport schedules;
- availability;
- route-map data;
- legal requirements;
- weather.

These facts must pass through the corresponding normalized tools/provider evidence. Model output without appropriate current evidence remains inference/non-authoritative or fails validation when declared as a protected fact.

RAG alone does not bypass Legal/Transport/Map authority boundaries.

## Real STOP boundary after AI/Knowledge Foundation

After the final AI/Knowledge PR checkpoint, stop before any of the following choices/actions:

1. selecting a real model/runtime provider;
2. selecting model family/model tier and fallback strategy;
3. selecting an embedding provider/model;
4. selecting a vector DB or retrieval/indexing engine;
5. approving the production Knowledge source set;
6. defining production ingestion, refresh, retention and deletion policy;
7. deciding whether/when to add a Weather tool/provider;
8. configuring AI/provider credentials;
9. enabling production AI/RAG wiring;
10. using a paid service;
11. production deployment;
12. irreversible migration/deletion;
13. merge to `main`.

These are product/technical decisions and require explicit confirmation.

## Later roadmap — not started

- real AI/model runtime adapter;
- production Knowledge ingestion/retrieval;
- embedding/vector infrastructure;
- Budget provider inputs / Currency contract;
- real Legal source adapters;
- real Map adapter/provider activation;
- Stay/Weather integrations;
- Trip Book export/generation;
- Live Companion;
- Safe/emergency capabilities.
