# ARVELIS AI — Location Directory SQL Persistence V1

**Статус:** engineering qualification slice, не production activation.

**Дата:** 2026-09-17.

## Parent checkpoint

Этот slice начинается только после полной квалификации Draft PR #46:

- branch `feat/travel-location-directory-persistence-ranking-v1`;
- exact parent HEAD `5a337120443a6bf8b9036e3e9e5eac65dc9f3e27`;
- exact-head PR run `35269585932`;
- `validate` — SUCCESS;
- `postgres-compat` — SUCCESS.

Текущая branch:

- `feat/travel-location-directory-sql-persistence-v1`.

## Цель

Перевести квалифицированный provider-neutral Location Directory repository contract из process-local reference semantics в durable SQLite/PostgreSQL persistence, не активируя live providers, Routes UI или production import.

## Additive migration 004

Добавлена:

`server/db/migrations/004_location_directory_foundation.sql`

PostgreSQL schema содержит четыре области:

1. `travel_location_directory_revisions`
   - source revision;
   - country;
   - source modified date;
   - retrieval time;
   - SHA-256 source fingerprint;
   - license;
   - attribution URL.

2. `travel_location_identities`
   - `(source, external_source_id)` как стабильная source identity;
   - отдельный unique `arvelis:location:*` identity;
   - source identity не становится public identity.

3. `travel_location_records`
   - revision-specific snapshot record;
   - stable ARVELIS location ID;
   - display/type/country/region/timezone/coordinates/population.

4. `travel_location_names`
   - normalized exact-search names;
   - original search name;
   - primary-name marker;
   - index для bounded exact lookup.

Migration только создаёт новые таблицы/индексы. Она не удаляет и не изменяет существующие Auth/Trip/Knowledge tables.

## PostgreSQL repository

Добавлен:

`server/persistence/postgres/locationDirectoryRepository.ts`

Properties:

- strict contract validation до записи;
- revision registration idempotent только при полном совпадении metadata;
- conflicting revision fail-closed;
- transaction-safe source identity allocation;
- одна `(source, external_source_id)` сохраняет ARVELIS ID между revisions;
- revision-specific records могут обновляться без смены internal identity;
- aliases заменяются транзакционно при re-upsert;
- exact normalized lookup возвращает provider-neutral records;
- lookup делает `maxMatches + 1` probe и fail-closed при overflow;
- external source IDs не попадают в public `TravelLocationCandidateV1` через directory resolver.

## SQLite repository

Добавлен:

`server/persistence/sqlite/locationDirectoryRepository.ts`

SQLite development/test schema добавляется отдельной checksum migration `004_location_directory_foundation` внутри существующего safe SQLite migration mechanism.

SQLite adapter сохраняет те же repository semantics:

- revision conflict protection;
- stable source→ARVELIS identity mapping;
- transaction-safe record + alias replacement;
- exact normalized lookup;
- bounded overflow protection;
- same provider-neutral resolver boundary.

Это позволяет dev/Replit path не зависеть от отдельного PostgreSQL сервера для базовых deterministic tests.

## Shared safety refinement

`LocationDirectoryLookupV1` получил общий validator, используемый reference, SQLite и PostgreSQL repositories.

При превышении bounded match set repository fail-closed вместо тихой обрезки. Это сохраняет правило: internal truncation не должна превращать неоднозначный набор в ложный `resolved`.

## Tests

### SQLite

`npm run test:location-directory-sqlite`

Проверяет:

- наличие checksum migration 004;
- revision persistence;
- stable ARVELIS identity;
- exact lookup;
- primary-name ranking через общий resolver;
- `ambiguous` semantics;
- transactional replacement stale aliases;
- identity reuse across source revisions.

### PostgreSQL

`npm run test:location-directory-postgres`

Запускается только после `npm run db:migrate` в PostgreSQL CI job и проверяет:

- наличие всех четырёх новых tables;
- revision persistence;
- durable identity allocation;
- exact lookup/ranking;
- alias replacement;
- identity reuse across revisions;
- integration с существующим `RepositoryTravelLocationDirectory` + `LocationResolutionService`.

SQLite gate включён в обычный `npm run check`.

PostgreSQL gate включён в `check:with-db` и отдельный `postgres-compat` CI step.

## Security / operations boundaries

Этот slice НЕ:

- импортирует официальный RU dump в application DB;
- включает background refresh;
- создаёт Yandex provider bindings;
- вызывает Yandex network;
- выдаёт GeoNames IDs browser/model;
- включает Routes live UI;
- меняет env/secrets;
- подключает платные сервисы;
- применяет migration к production;
- выполняет merge в `main`;
- делает production deployment.

`db:migrate` в CI работает только с одноразовой PostgreSQL service database, заданной workflow.

## Что остаётся после qualification

Следующий безопасный pass:

**GeoNames Controlled Directory Import V1**

Его задача — не production rollout, а bounded importer, который:

1. принимает только ранее валидированный manifest + parsed seeds;
2. регистрирует конкретный source revision;
3. импортирует records через `LocationDirectoryIngestionService`;
4. поддерживает bounded batches/transactions;
5. собирает deterministic import report;
6. не делает revision active автоматически;
7. не создаёт provider bindings автоматически;
8. не активирует Routes UI.

После controlled import отдельно требуется activation/revision-selection policy и только затем trusted Location → Yandex binding layer.
