# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-09.

Предыдущая universal/chat-first roadmap superseded решением `Travel Product Pivot`. Исторические этапы и PR не удаляются.

## Foundation — сохранено

- [x] ARVELIS AI name/tagline/brand geometry.
- [x] React + TypeScript + Vite frontend foundation.
- [x] mobile-first/safe-area/reduced-motion UI hardening.
- [x] Passwordless Email OTP + Account/Session foundation.
- [x] SQLite closed-test auth persistence.
- [x] PostgreSQL-compatible auth persistence.
- [x] Replit runtime configuration.
- [x] CI/npm lockfile/build foundation.

## Travel Pivot Foundation V1 — завершённый foundation

- [x] Travel vertical / target user / main problem / main flow fixed.
- [x] `Trip` primary aggregate.
- [x] local preview Trip repository boundary.
- [x] Trip Workspace / Itinerary / Map / Budget / Legal / Trip Book foundations.
- [x] provider-neutral AI/Transport/Map/Legal/Weather/Stay/Currency contracts.
- [x] existing auth/server foundation preserved.

## Travel UI Redesign V2 — завершённый presentation slice

- [x] light AI-first Home;
- [x] side drawer primary navigation;
- [x] general + trip-scoped ARVELIS AI UI contexts;
- [x] mobile-first Create Trip wizard;
- [x] responsive Trip Workspace;
- [x] truthful provider unavailable/empty states;
- [x] simplified Profile / dev-only diagnostics;
- [x] iPhone UI polish.

## Server-side Trip Persistence & API V1 — DoD CLOSED / Draft PR #28

- [x] account-scoped server Trip repository/API;
- [x] server-authoritative ownership/timestamps;
- [x] SQLite + PostgreSQL adapters/migrations;
- [x] authenticated frontend same-origin repository;
- [x] no silent server→local fallback;
- [x] typecheck/server build/browser/frontend build;
- [x] PostgreSQL 18.4 migration/persistence/ownership;
- [x] final read-only CI (`contents: read`).

Merge в `main` не выполнялся.

## Plan Real-Data Contract & AI Orchestration Policy V1 — CURRENT RELEASE GATE / Draft PR #29

Base: `feat/travel-trip-persistence-v1` / `9d147e8955e158b8684a0a9ef399415ff64358c8`.

Цель — зафиксировать trusted planning boundary до подключения реальной модели/RAG/provider.

- [x] typed `PlanRequest` с минимизированным Trip snapshot;
- [x] typed `PlanProposal`;
- [x] declared sources + claim provenance;
- [x] `user_input / provider_fact / model_inference / unknown`;
- [x] `AIProvider.planTrip()` переведён с `Promise<unknown>` на typed contract;
- [x] server `PlanOrchestrator`;
- [x] account ownership fail closed;
- [x] provider-not-connected state;
- [x] timeout;
- [x] caller cancellation;
- [x] no silent/mock/provider fallback;
- [x] deterministic proposal validation;
- [x] legal provider fact требует official HTTPS source;
- [x] model inference для price/availability/schedule/legal/weather не authoritative;
- [x] expired provider evidence не authoritative;
- [x] audit metadata без prompt/response body и secrets;
- [x] minimal business/security smoke;
- [x] project typecheck;
- [x] server runtime build;
- [x] existing Trip/browser/frontend regression gate;
- [x] Draft PR #29 открыт;
- [ ] final Draft PR regression gate на documentation head.

Реальный AI vendor/model, RAG/vector DB и travel provider в этот slice не входят.

## Следующий roadmap layer — после зелёного Plan V1 checkpoint

### Transport / normalized route comparison contract

Следующий этап можно начинать без выбора конкретного провайдера:

1. normalized transport search request из Trip/Plan constraints;
2. typed route/segment result contract;
3. provider provenance для schedule/price/availability;
4. currency/price timestamp/validity boundary;
5. route comparison metrics без fake score;
6. deduplication/normalization rules;
7. timeout/cancellation/error semantics для transport adapters;
8. deterministic validation перед записью route result в Trip;
9. provider-neutral interface/tests;
10. никаких реальных booking/purchase действий.

Подключение конкретного transport provider — отдельное решение после contract layer, особенно если нужны платный API, production secrets, юридическая проверка или vendor lock-in.

## Later Travel sequence

1. Budget provider inputs and currency handling;
2. Legal source ingestion/verification;
3. Map provider implementation;
4. Stay/Weather integrations where justified;
5. Trip Book export/generation;
6. Live Companion;
7. Safe/emergency capabilities.

## Still outside approved scope

- real AI/RAG provider;
- booking/ticket purchase;
- production transport/stay/map/legal/weather providers;
- payments/billing/subscriptions;
- production deployment/public registration rollout;
- destructive Trip deletion/retention API;
- AR/offline maps;
- Live/Safe automation;
- camera/realtime voice;
- Travel Memory/full Group Travel.

Каждый внешний provider — отдельное engineering/security/legal решение. Paid integration не подразумевается roadmap автоматически.
