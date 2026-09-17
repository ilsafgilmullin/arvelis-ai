# ARVELIS AI — Project State Sync V1

**Дата фиксации:** 2026-09-17.

## Назначение

Этот документ синхронизирует верхнеуровневый контекст ARVELIS AI с фактическим состоянием текущего stacked GitHub-стека после GeoNames Controlled Ingestion Evaluation V1.

Он не заменяет детальные slice-документы `docs/42_...`–`docs/63_...`; он задаёт актуальную карту состояния и правила чтения документации.

## Source of truth

Порядок доверия при расхождениях:

1. фактический GitHub repository `ilsafgilmullin/arvelis-ai`, exact active branch/HEAD и фактический CI;
2. наиболее новый специализированный slice-документ, относящийся к конкретной подсистеме;
3. верхнеуровневые `00_PROJECT_CONTEXT`, `02_ARCHITECTURE`, `03_ROADMAP`, `05_SECURITY`, `06_MVP_GATES`;
4. исторический журнал `07_DECISIONS`.

Исторические записи не удаляются. Если более новый квалифицированный slice опровергает старый runtime-status, новый evidence имеет приоритет, а старый текст считается историческим checkpoint, а не текущим состоянием.

## Точный родительский checkpoint

Этот sync-слой начинается от Draft PR #44:

- branch: `feat/travel-geonames-controlled-ingestion-eval-v1`;
- exact parent HEAD: `ec28cd0dd6159a24c4c8c6a33da6f74be3cb8e52`;
- exact-head ARVELIS CI: `35146640908` — SUCCESS;
- `validate`: SUCCESS;
- `postgres-compat`: SUCCESS.

PR #44 остаётся Draft/Open и не слит в `main`.

## Текущий продуктовый контур

ARVELIS AI — бесплатный user-facing **AI Travel Assistant**.

Утверждено:

- основной пользователь — русскоязычный самостоятельный путешественник;
- география — Россия и международные поездки;
- приоритетные устройства — iPhone, Android, desktop;
- центральный доменный объект — `Trip`;
- основные продуктовые области — Plan, Transport, Budget, Legal, Map, Itinerary, Trip Book;
- Live Companion и Safe/emergency capabilities остаются future-only;
- billing/subscriptions/paywall сейчас не проектируются;
- бренд `ARVELIS AI`, геометрия знака и слоган `INTELLIGENCE. PRECISION. RESULTS.` не меняются;
- актуальная пользовательская Travel UI-система определяется более поздним Travel UI Redesign V2, а не ранним chat-first preview.

## Текущий технический state

### Frontend / product shell

- React 19 + TypeScript 6 + Vite 8;
- Travel-first composition;
- Home / Trips / Plan / Routes / Budget / Documents / Map / Settings foundations;
- mobile-first contract и browser happy-path в CI;
- Routes UI не выдаёт fixture/mock transport data за live provider data.

### Auth / persistence

- passwordless Email OTP foundation;
- Account/Session server-authoritative;
- server-side Trip ownership;
- server-backed Trip repository/API;
- SQLite development/test persistence;
- PostgreSQL-compatible persistence;
- PostgreSQL migrations и Trip ownership проверяются CI.

Старое утверждение `localStorage-only / production Trip repository OPEN` больше не является текущим состоянием.

### AI / Knowledge

- provider-neutral `AiGateway`;
- provider-neutral runtime boundary;
- Knowledge/Retrieval foundation;
- PostgreSQL + pgvector compatibility;
- Qwen vLLM adapter foundation как production-oriented candidate, без production runtime activation;
- Qwen3-8B Q4_K_M через pinned llama.cpp был реально выполнен в контролируемой evaluation среде;
- Required Tool Routing V1 квалифицирован для существующего synthetic workload;
- Production Transport Search Contract V1 прошёл контролируемую Qwen qualification.

Старое утверждение `LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE` superseded более новым evidence из `docs/55_REQUIRED_TOOL_ROUTING_V1.md` и `docs/56_PRODUCTION_TRANSPORT_SEARCH_CONTRACT_V1.md`.

Это **не** означает production AI readiness: BF16/vLLM capacity, concurrency, production latency/SLA, GPU topology, monitoring и rollback не квалифицированы.

### Transport / Yandex

- production-shaped normalized transport request/response contracts существуют;
- required live transport facts могут детерминированно маршрутизироваться server-side;
- authenticated Trip-bound endpoint `POST /api/trips/:tripId/transport/search` существует;
- provider raw data/credentials не выдаются browser/model boundary;
- Yandex Rasp normalized provider, trusted binding boundary и attribution primitives реализованы;
- production fallback на development bindings запрещён;
- application activation gates остаются fail-closed;
- live Yandex provider E2E не квалифицирован;
- production Yandex activation не выполнена.

### Location Resolution / GeoNames

- provider-neutral Location Resolution Foundation квалифицирован;
- arbitrary user/model text не становится trusted provider identity;
- ambiguous candidates остаются ambiguous;
- GeoNames выбран для controlled offline source path;
- strict GeoNames source parser и provenance boundary квалифицированы;
- controlled official RU snapshot evaluation квалифицирована;
- `412,812` строк измерено;
- `201,299` Travel-relevant records принято;
- `586` target rows отклонено fail-closed;
- обнаружено `20,612` duplicate normalized primary-name groups, max multiplicity `405`.

Следствие: name-only auto-resolution запрещён. `geonameId` — source provenance, а не `arvelis:*` identity.

## Что ещё НЕ готово

- durable ARVELIS Location Directory persistence;
- стабильная issuance policy для внутренних `arvelis:*` location IDs;
- ranking/disambiguation implementation и refresh/revision semantics;
- trusted production location-to-provider binding;
- live Yandex development/provider verification через полный ARVELIS path;
- user-facing Routes end-to-end live search;
- production AI runtime/capacity;
- production observability, backup/recovery и incident operations;
- production privacy/legal/data-residency package;
- финальная physical mobile/accessibility acceptance;
- production deployment/readiness.

ARVELIS AI на этом checkpoint **не считается production-ready**.

## Следующий безопасный engineering slice

**Location Directory Persistence & Ranking Foundation V1**.

Его границы:

- provider-neutral durable internal location identity;
- source provenance/revision model;
- canonical location отдельно от names/aliases;
- bounded normalized-name search;
- ranking по доверенному контексту (type/country/admin/population) без скрытого auto-select;
- ambiguity сохраняется, когда доказательств недостаточно;
- external provider/source IDs не становятся browser/model trusted identity;
- deterministic tests до production activation;
- никаких Routes UI activation, Yandex production activation, paid services, production deploy или merge в `main`.

## Что этот sync НЕ меняет

Этот documentation sync не меняет:

- runtime behavior;
- dependencies или lockfile;
- Node/Replit configuration;
- database schema/migrations;
- API contracts;
- secrets/env values;
- Yandex activation flags;
- Qwen model/runtime/timeouts;
- production state.
