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
Base: Transport Contract V1 / `28ea5ab063f7e0c152ac92bffbe9c7d89a440e92`

- [x] provider-neutral activation policy;
- [x] official-terms review boundary;
- [x] free-product compatibility gate;
- [x] attribution/branding metadata;
- [x] quota/credentials gate;
- [x] cache/storage restriction metadata;
- [x] future monetization change handled outside Travel Domain;
- [x] normalized `legId`;
- [x] explicit price semantics (`from/quoted/cached_observation/unknown`);
- [x] Yandex Rasp adapter foundation with injected client/resolver;
- [x] `et_marker` not treated as availability;
- [x] no fake provider `validUntil`;
- [x] Aviasales Search blocked for current early-stage strategy;
- [x] Aviasales Data retained only as future cached insight source;
- [x] Product/Architecture/Roadmap/Security/README synchronized;
- [x] `docs/47_TRANSPORT_PROVIDER_STRATEGY_ADAPTER_FOUNDATION_V1.md` added;
- [x] PR #31 validate PASS;
- [x] PR #31 PostgreSQL 18.4 lower-layer regression PASS.

No real API key, live HTTP traffic, booking or production activation belongs to this foundation slice.

## Current slice — Yandex Rasp Live Adapter V1

Scope без production activation:

1. real server-side HTTP client;
2. env-only `YANDEX_RASP_API_KEY`;
3. location resolution;
4. official Yandex request/response mapping;
5. attribution output contract;
6. temporary-cache-only policy;
7. provenance/freshness without invented provider validity;
8. truthful disabled/not_connected without key;
9. one server-side HTTP happy-path through stub/fake endpoint;
10. no booking/payment/persistent Yandex result storage.

Перед фактической activation ключа повторно проверяются current official Yandex terms, attribution, quota и endpoint access.

## Provider candidates after Yandex

- Aviasales Search API — **не подключать сейчас**;
- Aviasales Data API — только future cached price insights;
- другие providers — только после отдельного official terms/coverage/security review.

## Later Travel sequence

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
