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
- [x] Yandex Rasp Live Adapter V1 — Draft PR #32, green, not merged; production key not activated.

## Current slice — Map Provider Foundation & Route Map V1

Branch: `feat/travel-map-provider-foundation-v1`  
Base: Yandex Rasp V1 / `dc7da2ab920411bb39105c368e16ae90dcd0ef90`  
Draft PR #33.

Scope / DoD:

- [x] provider-neutral `MapRouteRequest/MapRouteResponse`;
- [x] origin/destination/waypoint contract without vendor fields in `Trip`;
- [x] bounded coordinates/geometry/attribution validation;
- [x] user-provided coordinate integrity fail-closed;
- [x] origin/destination resolution required;
- [x] ownership-aware `MapOrchestrator`;
- [x] timeout/cancellation;
- [x] truthful `not_connected` without provider;
- [x] freshness current/expired/unspecified without invented `validUntil`;
- [x] no automatic persistence of provider map result;
- [x] old decorative fake-route schematic hidden from active UI;
- [x] one server-backed Chromium happy-path covers truthful Map empty state;
- [x] implementation validate + PostgreSQL regression PASS;
- [x] README + dedicated `docs/49_MAP_PROVIDER_FOUNDATION_ROUTE_MAP_V1.md`;
- [ ] final validate/PostgreSQL PASS on documentation HEAD.

No real map vendor/SDK/key is connected in this slice.

## Next agreed slice — Legal Sources & Travel Legal Foundation V1

After Map DoD closes:

1. provider-neutral legal request/source/claim contracts;
2. official-source provenance model;
3. freshness/effective-date policy without invented legal validity;
4. ownership-aware Legal orchestrator;
5. untrusted-output validation;
6. truthful `not_connected`/needs-review states;
7. no real legal-source provider credentials or live ingestion.

## Then — ARVELIS AI Engine & Knowledge Foundation V1

After Legal DoD closes:

1. provider-neutral knowledge/evidence contracts;
2. source trust/provenance policy;
3. retrieval/model boundaries without choosing a live vendor;
4. prompt/context minimization;
5. no model-generated fact promoted to authoritative external fact without evidence;
6. truthful `not_connected` without AI/model/retriever.

## Real STOP boundary

Stop before the first step that requires one of:

- real provider/model credentials;
- paid service;
- production deployment/wiring;
- irreversible migration/deletion;
- a product decision about model vendor, knowledge-source set/indexing strategy, or legal/map provider selection;
- merge to `main`.

## Later roadmap — not started

- Budget provider inputs / Currency contract;
- real Legal source adapters;
- real Map adapter/provider activation;
- Stay/Weather integrations;
- Trip Book export/generation;
- Live Companion;
- Safe/emergency capabilities.
