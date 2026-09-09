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
- [x] Map Provider Foundation & Route Map V1 — Draft PR #33, green, not merged; no real map provider.

## Current slice — Legal Sources & Travel Legal Foundation V1

Branch: `feat/travel-legal-sources-foundation-v1`  
Base: Map V1 / `bd46fc12064faf2dd807782c35106ec062bb08dd`

Scope / DoD:

- [x] typed provider-neutral `LegalCheckRequest`;
- [x] route-general scope only;
- [x] citizenship/passport/nationality not invented or added to `Trip`;
- [x] typed legal source/claim contracts;
- [x] every claim requires source reference;
- [x] `verified` claims require official HTTPS sources;
- [x] expired/unknown freshness never authoritative;
- [x] ownership fail-closed before provider call;
- [x] timeout/cancellation;
- [x] malformed/untrusted provider output fail-closed;
- [x] truthful `not_connected` without provider;
- [x] one business/security/freshness gate;
- [x] implementation push validate PASS;
- [x] README/Architecture/Roadmap/Security documentation;
- [x] `docs/50_LEGAL_SOURCES_TRAVEL_LEGAL_FOUNDATION_V1.md`;
- [ ] stacked Draft PR;
- [ ] final PR-triggered validate + PostgreSQL regression PASS.

No real legal-source provider, credentials or production ingestion is connected.

## Next agreed slice — ARVELIS AI Engine & Knowledge Foundation V1

After Legal DoD closes:

1. provider-neutral AI Gateway;
2. model/runtime adapter boundary without choosing a real vendor;
3. Knowledge source/evidence contracts;
4. retrieval/RAG boundary;
5. tool registry for Trip/Transport/Map/Legal;
6. structured output validation;
7. provenance/trust policy;
8. timeout/cancellation;
9. evaluation policy;
10. truthful `not_connected` when model/runtime/retriever is absent.

Hard rule: model output is **not** a source of authoritative facts for price, transport schedules, legal rules, weather or availability. Those facts must come through source-backed tools/provider contracts.

## Real STOP boundary after AI/Knowledge Foundation

Stop before the first step that requires one of:

- selecting/activating a real model/runtime provider;
- selecting an embedding provider;
- selecting a vector database;
- production knowledge ingestion/source-set decision;
- real provider credentials;
- paid service;
- production deployment/wiring;
- irreversible migration/deletion;
- merge to `main`.

## Later roadmap — not started

- Budget provider inputs / Currency contract;
- real Legal source adapters;
- real Map adapter/provider activation;
- Stay/Weather integrations;
- Trip Book export/generation;
- Live Companion;
- Safe/emergency capabilities.
