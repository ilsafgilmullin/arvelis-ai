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
- [x] iPhone UI polish for drawer scroll, screen scroll reset, labels and mobile form controls.

Physical-device checks остаются acceptance QA и не меняют product scope.

## Server-side Trip Persistence & API V1 — DoD CLOSED / Draft PR #28

Реализация собрана в `feat/travel-trip-persistence-v1` поверх Travel UI V2 и оставлена Draft без merge.

- [x] account-scoped server Trip repository contract;
- [x] `GET /api/trips`;
- [x] `GET /api/trips/:id`;
- [x] `PUT /api/trips/:id`;
- [x] server-authoritative owner from authenticated session;
- [x] foreign `ownerScopeId` rejection;
- [x] server-authoritative created/updated timestamps;
- [x] SQLite additive migration + adapter;
- [x] PostgreSQL additive migration + adapter;
- [x] real-auth frontend switched behind repository boundary to same-origin API;
- [x] preview remains explicit local-only mode;
- [x] no silent server→local fallback;
- [x] dependency audit restored to zero vulnerabilities (`nodemailer 9.1.1`);
- [x] CI restored to `contents: read`; self-mutating lock step removed;
- [x] typecheck;
- [x] SQLite migration/business/ownership test;
- [x] server runtime build;
- [x] one real server-backed Chromium happy-path at `390×844`;
- [x] frontend build;
- [x] PostgreSQL 18.4 migrations `001 + 002`;
- [x] PostgreSQL migration/persistence/ownership gate;
- [x] Draft PR #28 records the checkpoint.

Merge в `main` не является частью DoD и не выполнялся.

## Next agreed slice — CURRENT AFTER PERSISTENCE DoD

### Plan real-data contract / AI orchestration policy

Цель — определить, как ARVELIS формирует Plan из user constraints, verified source/provider inputs и будущего AI reasoning, не подключая vendor «любой ценой».

Boundaries текущего следующего этапа:

1. входной `PlanRequest` / immutable Trip snapshot;
2. provenance каждой значимой части результата;
3. разделение user facts, provider facts, model inference и unknown;
4. provider-neutral AI orchestration port;
5. timeout/cancellation/error/fallback policy;
6. запрет model-generated legal/price/availability facts без authoritative source;
7. structured Plan result, который можно безопасно применить к Trip;
8. audit metadata без хранения secrets/лишнего sensitive content;
9. deterministic validation до записи результата;
10. никакого real vendor adapter в contract slice.

Реальный AI/provider connection этим этапом не подразумевается автоматически.

## Later Travel sequence

1. Transport providers and normalized route comparison;
2. Budget provider inputs and currency handling;
3. Legal source ingestion/verification;
4. Map provider implementation;
5. Stay/Weather integrations where justified;
6. Trip Book export/generation;
7. Live Companion;
8. Safe/emergency capabilities.

Каждый внешний provider — отдельное engineering/security/legal решение. Paid integration не подразумевается roadmap автоматически.

## Still outside approved scope

- booking/ticket purchase;
- production transport/stay/map/legal/weather providers;
- payments/billing/subscriptions;
- production deployment/public registration rollout;
- destructive Trip deletion/retention API;
- AR/offline maps;
- Live/Safe automation;
- camera/realtime voice;
- Travel Memory/full Group Travel.
