# ARVELIS AI — контекст проекта

**Актуальность:** 2026-09-17, Project State Sync V1.

## Статус

ARVELIS AI — профессиональный продукт в вертикали **AI Travel Assistant**. Текущий инженерный этап — переход от уже квалифицированных Travel/AI/Transport foundations к доверенному location directory и первому полному live transport path без преждевременной production-активации.

Текущий верхний квалифицированный parent checkpoint до documentation sync:

- Draft PR #44 `GeoNames Controlled Ingestion Evaluation V1`;
- branch `feat/travel-geonames-controlled-ingestion-eval-v1`;
- exact HEAD `ec28cd0dd6159a24c4c8c6a33da6f74be3cb8e52`;
- exact-head CI `35146640908` — SUCCESS (`validate` + `postgres-compat`).

## Источник истины

Источник истины для кода — GitHub repository `ilsafgilmullin/arvelis-ai`, фактическая stacked-ветка текущего slice, exact HEAD и фактический CI.

При расхождениях документации более новый специализированный evidence/slice документ имеет приоритет над старым status-текстом. Исторические решения не удаляются.

Актуальная сводка состояния: `docs/64_PROJECT_STATE_SYNC_V1.md`.

## Утверждено по продукту

- Название: `ARVELIS AI`.
- Слоган: `INTELLIGENCE. PRECISION. RESULTS.`
- Геометрия утверждённого знака не меняется без отдельного решения.
- Вертикаль: `AI Travel Assistant`.
- User-facing сервис на текущем этапе бесплатный; billing/subscriptions/paywall не проектируются.
- Основной пользователь: русскоязычный самостоятельный путешественник; приоритетные форматы — одиночные поездки, пары, семьи и небольшие группы.
- География продукта: поездки по России и международные поездки.
- Приоритетные устройства: iPhone, Android, desktop.
- Базовая проблема: превратить бюджет, даты, состав, ограничения и предпочтения в один проверяемый Trip plan вместо набора разрозненных поисков и заметок.
- Основной объект домена: `Trip`.
- Ключевые области: Plan, Transport, Budget, Legal, Map, Itinerary, Trip Book.
- Future-only: Live Companion и Safe/emergency capabilities.
- Provider-neutrality обязательна для AI, transport, map, legal и location layers.
- Защищённые внешние факты не могут становиться authoritative только из model prose или Knowledge chunk; требуется подходящее current tool/provider evidence.

## UX / Brand

Ранний graphite + gold бренд остаётся исторической базой идентичности и утверждённой геометрии логотипа, но актуальная пользовательская Travel UI-система определяется более поздним `Travel UI Redesign V2`.

Не менять без отдельного решения:

- название `ARVELIS AI`;
- геометрию знака;
- композицию основного logo asset;
- слоган.

Не возвращать продукт автоматически к старой chat-first навигации или старому preview UX: Travel product остаётся Trip-first.

## Текущий technical state

### Platform

- React 19.2.8;
- React DOM 19.2.8;
- TypeScript 6.0.3;
- Vite 8.x;
- Node engine `>=22.12.0 <27`;
- Replit использует Node 22;
- `package-lock.json` присутствует;
- CI использует `npm ci`.

### Auth / Trip data

- passwordless Email OTP foundation;
- Account/Session server-authoritative;
- server-side Trip ownership;
- server-backed Trip API/repository;
- SQLite development/test path;
- PostgreSQL-compatible persistence;
- PostgreSQL migrations и ownership regressions проходят CI.

Старый статус `Travel data only in localStorage / production Trip persistence OPEN` superseded.

### AI / Knowledge

- provider-neutral `AiGateway` и `AiModelRuntime`;
- Retrieval/Knowledge foundation;
- PostgreSQL + pgvector compatibility;
- `QwenVllmRuntime` остаётся production-oriented candidate без production deployment;
- Qwen3-8B Q4_K_M через pinned llama.cpp реально выполнялся в controlled evaluation;
- Required Tool Routing V1 квалифицирован для текущего synthetic workload;
- Production Transport Search Contract V1 получил повторную controlled qualification.

Это не является production AI capacity/SLA qualification.

### Transport

- normalized Transport contracts и freshness/evidence policies реализованы;
- authenticated Trip-bound transport runtime API существует;
- Yandex Rasp normalized provider, trusted binding boundary и attribution primitives реализованы;
- provider composition fail-closed;
- production bindings отсутствуют намеренно;
- live Yandex E2E и production activation не выполнены.

### Location

- provider-neutral Location Resolution Foundation квалифицирован;
- arbitrary free-form text не считается trusted location identity;
- GeoNames source boundary выбран для controlled offline path;
- официальный RU snapshot прошёл controlled ingestion evaluation;
- real-data evidence подтверждает значительную неоднозначность имён;
- `geonameId` не является ARVELIS location identity.

## Остаётся OPEN

Приоритетно:

1. Location Directory Persistence & Ranking Foundation V1;
2. internal `arvelis:*` location identity/revision model;
3. deterministic ranking + ambiguity handling;
4. trusted location-to-provider binding;
5. изолированный live Yandex development/provider smoke через ARVELIS boundary;
6. user-facing Routes end-to-end live search;
7. production AI runtime/capacity/monitoring/rollback;
8. backup/recovery и production observability;
9. production privacy/legal/data-residency package;
10. физическая iPhone/Android/desktop + accessibility acceptance;
11. release/integration plan и только отдельно подтверждённый merge/deploy.

## Production boundary

ARVELIS AI на текущем checkpoint **не production-ready**.

Не выполнять без отдельного подтверждения:

- merge в `main`;
- production deploy;
- production secret changes;
- paid services;
- destructive migrations;
- Yandex production activation;
- public model endpoint/GPU rollout.
