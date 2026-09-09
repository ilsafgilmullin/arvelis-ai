# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-09.

Исторические universal/chat-first этапы сохраняются, но Travel Product Pivot остаётся текущим продуктовым направлением.

## Закрытые foundation layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1 — Draft PR #28, green, not merged;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29, green, not merged;
- [x] Transport Normalized Route Contract V1 — Draft PR #30, green, not merged.

## Transport Normalized Route Contract V1 — DoD CLOSED

Branch: `feat/travel-transport-contract-v1`  
Base: Plan V1 / `7e99c1f118f037fcf90b488a1c2b24e409bedcf6`

- [x] minimized `TransportSearchRequest`;
- [x] explicit destination + exact-date V1 boundary;
- [x] typed normalized modes/segments/routes;
- [x] typed `TransportProvider` with request context + `AbortSignal`;
- [x] provider/request identity validation;
- [x] normalized amount in minor units + 3-letter currency;
- [x] explicit availability;
- [x] retrieval/validity freshness boundary;
- [x] route chronology validation;
- [x] server Transport orchestrator;
- [x] account ownership fail closed;
- [x] timeout/cancellation/not-connected/error semantics;
- [x] deterministic duration/transfer/price comparison;
- [x] no opaque/fake route score;
- [x] mixed currency comparison fail closed;
- [x] stale/unbounded data not authoritative;
- [x] Plan/Trip regressions;
- [x] typecheck/server/browser/frontend gate;
- [x] stacked Draft PR #30 final regression;
- [x] PostgreSQL 18.4 lower-layer regression.

Real transport provider, booking, FX provider и vendor keys не входят в contract slice.

## Текущая продуктовая модель

ARVELIS AI на текущем этапе — полностью бесплатный user-facing сервис.

- billing не проектируется;
- subscriptions не проектируются;
- paywall не проектируется;
- Travel Domain остаётся независимым от будущей monetization model;
- внутренние provider quotas/cost controls допустимы только как backend/application policy.

## Next agreed slice — Transport Provider Strategy & Adapter Foundation V1

Перед реализацией каждого real adapter обязательно проверяются актуальные официальные:

1. API terms и разрешённый тип проекта;
2. бесплатность/стоимость provider access;
3. attribution/branding requirements;
4. quotas/rate limits;
5. caching/storage/processing restrictions;
6. право показывать schedule/price/availability;
7. deeplink/affiliate/booking policy;
8. доступность из России/backend topology;
9. credentials/secret handling;
10. vendor lock-in и возможность замены без изменения Travel Domain.

Foundation должен оставаться provider-neutral. Конкретный provider activation, API key и production traffic требуют отдельного подтверждения условий непосредственно перед подключением.

## Later Travel sequence

1. real Transport adapter(s) после terms/credentials gate;
2. Budget provider inputs / Currency contract;
3. Legal source ingestion/verification;
4. Map provider implementation;
5. Stay/Weather integrations;
6. Trip Book export/generation;
7. Live Companion;
8. Safe/emergency capabilities.

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
