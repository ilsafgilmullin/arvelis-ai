# ARVELIS AI — Travel MVP readiness gates

**Актуальность:** 2026-09-17, Project State Sync V1.

Этот документ отделяет уже утверждённые/квалифицированные foundations от того, что ещё требуется для user-facing live MVP и production readiness.

Статусы:

- `APPROVED` — продуктовое решение утверждено;
- `QUALIFIED` — реализовано и прошло соответствующие текущему scope проверки;
- `FOUNDATION` — рабочая основа существует, но production qualification неполная;
- `OPEN` — обязательный gate ещё не закрыт.

## 1. Целевой пользователь — APPROVED

Русскоязычный самостоятельный путешественник: solo, пары, семьи, небольшие группы; Россия + international; iPhone/Android/desktop; бюджетные ограничения — важный сценарий.

## 2. Главная проблема — APPROVED

Объединить решения по бюджету, транспорту, времени, комфорту, legal, карте и программе в один проверяемый Trip plan, не маскируя предположения/model prose под внешние факты.

## 3. Основной сценарий — APPROVED / staged

Пользователь задаёт origin/destination или просит подобрать направление, даты/гибкость, duration, travelers, budget и preferences → ARVELIS оркестрирует domain/tools/providers → формирует проверяемые Plan/Transport/Budget/Legal/Map/Itinerary результаты → далее Trip Book.

Первый приоритетный real-data vertical slice: trusted location resolution + transport search.

## 4. Границы MVP — APPROVED / staged

Base Travel MVP areas:

- Plan/Discover;
- Transport;
- Budget;
- Legal;
- Map;
- Itinerary;
- Trip Book.

Future, не base MVP:

- Live Companion;
- Safe/emergency capabilities;
- AR/offline maps;
- camera/realtime voice;
- Travel Memory;
- full Group Travel;
- native mobile app.

## 5. Модель данных — QUALIFIED FOUNDATION / OPEN

Уже есть:

- Trip domain types;
- server-backed Trip repository/API;
- server-authoritative ownership;
- SQLite development/test persistence;
- PostgreSQL-compatible persistence;
- additive migrations для Auth/Trip/Knowledge;
- PostgreSQL + pgvector compatibility gates.

Старый статус `localStorage-only / production Trip schema OPEN` superseded.

Остаётся `OPEN`:

- durable Location Directory schema/persistence/ranking;
- location source revision/update model;
- provider binding persistence policy;
- backup/recovery/retention production policy.

## 6. Уровни доступа — QUALIFIED FOUNDATION / OPEN

Уже есть:

- passwordless Email OTP foundation;
- Account/Session server-authoritative;
- authenticated Trip ownership checks;
- server-side protected runtime endpoints.

Остаётся `OPEN`:

- sharing/group roles;
- production admin/owner authorization model для Travel operations;
- account recovery/linking final policy;
- production session/cookie/domain rollout review.

## 7. Security/privacy — QUALIFIED FOUNDATION / OPEN

Квалифицированные/реализованные текущие invariants:

- secrets server-side;
- provider/model/retrieval output untrusted до deterministic validation;
- protected external facts требуют matching current evidence/tool policy;
- account scope не передаётся model runtime как authorization credential;
- Trip ownership server-authoritative;
- Yandex provider activation fail-closed;
- provider raw responses/credentials не выдаются browser boundary;
- GeoNames raw dump не хранится в Git;
- arbitrary location text не становится trusted location identity;
- ambiguous location results не auto-select без утверждённой deterministic policy.

Остаётся `OPEN` до production:

- полный secret-history/security scan;
- production IAM/secret rotation;
- exact travel-document data categories и retention;
- backup encryption/recovery;
- observability/audit retention;
- privacy/legal/data-transfer/data-residency package;
- incident response/rollback.

## 8. Key screens — FOUNDATION / QUALIFIED PARTIALLY

Существуют Travel UI foundations для:

- Home;
- My Trips / Create Trip;
- Trip Workspace;
- Plan;
- Routes;
- Budget;
- Documents/Legal;
- Map;
- Settings/Profile.

Browser happy-path проходит CI.

При этом:

- Routes live search ещё не включён end-to-end;
- mock/fixture transport не должен отображаться как live data;
- physical acceptance на iPhone/Android/desktop и accessibility остаётся `OPEN`.

## 9. AI gate — CONTROLLED QUALIFICATION / PRODUCTION OPEN

Подтверждено:

- provider-neutral `AiGateway`;
- Qwen runtime adapters;
- pinned Qwen3-8B Q4_K_M реально выполнялся в controlled evaluation;
- Required Tool Routing V1 qualified для текущего synthetic workload;
- Production Transport Search Contract V1 qualified для текущей controlled Qwen evaluation;
- protected-fact policy остаётся fail-closed.

Не подтверждено:

- production vLLM/BF16 deployment;
- production GPU topology;
- concurrency/load/SLA;
- production inference monitoring/rollback;
- production cost/capacity policy.

Поэтому AI gate для production остаётся `OPEN`.

## 10. Transport provider gate — FOUNDATION / LIVE OPEN

Подтверждено:

- normalized Transport contract;
- provider-neutral service boundary;
- authenticated Trip-bound transport runtime API;
- Yandex Rasp normalized provider foundation;
- reviewed development binding boundary;
- attribution primitives;
- fail-closed activation/security gates.

Остаётся `OPEN`:

- production-capable trusted location directory;
- trusted arbitrary location → provider binding path;
- isolated live Yandex verification through full ARVELIS boundary;
- user-facing Routes E2E;
- production activation/quota/operational approval.

## 11. Location gate — EVALUATION QUALIFIED / PERSISTENCE OPEN

Подтверждено:

- provider-neutral Location Resolution contract/service;
- GeoNames provider strategy/source boundary;
- official RU controlled ingestion evaluation;
- real-data ambiguity evidence;
- source provenance rules;
- prohibition на `geonameId -> arvelis:*` direct aliasing;
- prohibition на name-only silent auto-resolution.

Остаётся `OPEN`:

- ARVELIS durable location ID issuance;
- Location Directory persistence;
- normalized lookup indexes;
- deterministic ranking/disambiguation;
- refresh/revision semantics;
- production `TravelLocationDirectory` implementation;
- Routes UI location-resolution activation.

## 12. Release criteria — OPEN

Перед public/production release обязательны:

- полный user-facing E2E для главного сценария;
- real provider verification и fallback policy;
- trusted location/provider identity path;
- quality/accuracy/freshness metrics;
- latency/error budgets;
- production AI capacity qualification;
- privacy/security/legal review;
- rate/cost controls;
- observability/audit/incident response;
- backup/recovery;
- secrets/IAM hardening;
- mobile/desktop/accessibility acceptance;
- closed-beta rollback criteria;
- отдельное подтверждение production deploy/merge.

## Текущий release verdict

**NOT PRODUCTION-READY.**

Текущий этап: development + controlled qualification.

Следующий безопасный slice: **Location Directory Persistence & Ranking Foundation V1**.

Ни один успешный synthetic/model/provider foundation test сам по себе не разрешает production activation.
