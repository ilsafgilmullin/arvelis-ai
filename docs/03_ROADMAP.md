# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-09.

Travel Product Pivot остаётся текущим продуктовым направлением.

## Закрытые foundation layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1 — Draft PR #28, green, not merged;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29, green, not merged;
- [x] Transport Normalized Route Contract V1 — Draft PR #30, green, not merged;
- [x] Transport Provider Strategy & Adapter Foundation V1 — Draft PR #31, green, not merged.

## Текущая продуктовая модель

ARVELIS AI на текущем этапе — полностью бесплатный user-facing сервис.

- billing не проектируется;
- subscriptions не проектируются;
- paywall не проектируется;
- Travel Domain не содержит monetization fields;
- provider quotas/cost controls остаются backend/application policy;
- будущая смена commercial model не должна требовать переписывания `Trip`.

## Transport Provider Strategy & Adapter Foundation V1 — DoD CLOSED

Branch: `feat/travel-transport-provider-foundation-v1`  
Final head: `c73deed052b0f94b5cbf791aa0385879fb073e43`  
Draft PR #31 — green, open, not merged.

Закрыто:

- provider-neutral activation policy;
- official-terms review boundary;
- free-product compatibility gate;
- attribution/branding metadata;
- quota/credentials gate;
- cache/storage restriction metadata;
- normalized `legId` и explicit price semantics;
- Yandex Rasp adapter foundation;
- `et_marker` not treated as availability;
- no fake provider `validUntil`;
- Aviasales Search blocked for current strategy;
- Aviasales Data retained only as future cached insight source;
- Product/Architecture/Roadmap/Security/README synchronized;
- PR-triggered validate + PostgreSQL 18.4 regression PASS.

## Yandex Rasp Live Adapter V1 — implementation/docs complete, final PR gate required

Branch: `feat/travel-yandex-rasp-live-adapter-v1`  
Base: Provider Foundation / `c73deed052b0f94b5cbf791aa0385879fb073e43`  
Implementation SHA: `df835cf92221cad3edb5d29b8e71a9f0a132ecf4`

Реализовано:

- [x] real server-side HTTP client на native Node `fetch`;
- [x] approved Yandex Rasp API host validation;
- [x] API key only in `Authorization` header;
- [x] env-only credentials;
- [x] fail-closed activation without key/fresh terms/quota confirmation;
- [x] official `stations_list`-based location resolution;
- [x] exact settlement/station matching;
- [x] ambiguous/missing location fail closed;
- [x] point-to-point request mapping;
- [x] normalized route mapping без изменения Trip Domain;
- [x] attribution output contract;
- [x] `et_marker` remains non-availability;
- [x] `from` price semantics;
- [x] no invented provider `validUntil`;
- [x] temporary in-memory search cache only;
- [x] bounded temporary location directory cache;
- [x] no persistent Yandex result storage;
- [x] one real server-side HTTP happy-path through local stub/fake endpoint;
- [x] existing TransportOrchestrator/Trip regressions preserved;
- [x] implementation push CI PASS on `df835cf92221cad3edb5d29b8e71a9f0a132ecf4`;
- [x] README/Architecture/Roadmap/Security closure;
- [x] `docs/48_YANDEX_RASP_LIVE_ADAPTER_V1.md` planned in current documentation head.

Final DoD gate before declaring the slice CLOSED:

- stacked Draft PR base `feat/travel-transport-provider-foundation-v1`;
- PR-triggered validate PASS on documentation HEAD;
- PR-triggered PostgreSQL 18.4 lower-layer regression PASS.

После этого slice считается **CLOSED**, но фактическая live API activation всё равно остаётся отдельным действием.

## STOP boundary after Yandex V1

После green final PR regression самостоятельно **не начинать новый slice**.

Не выполнять без отдельного подтверждения:

- production wiring;
- установку/активацию реального `YANDEX_RASP_API_KEY`;
- изменение production secrets;
- live provider traffic rollout;
- booking/ticket purchase/payment;
- persistent storage Yandex data;
- Aviasales Search API;
- Aviasales Data live integration;
- другие transport provider adapters;
- merge в `main`.

## Future Travel sequence — not started

Следующие пункты остаются только roadmap, а не текущим scope:

1. Budget provider inputs / Currency contract;
2. Legal source ingestion/verification;
3. Map provider implementation;
4. Stay/Weather integrations;
5. Trip Book export/generation;
6. Live Companion;
7. Safe/emergency capabilities.

## Всё ещё вне scope без отдельного решения

- real AI/RAG vendor;
- booking/ticket purchase;
- billing/subscriptions/paywall;
- production deployment/public registration;
- destructive Trip deletion/retention operations;
- production secrets;
- irreversible migrations;
- AR/offline maps;
- Live/Safe automation.
