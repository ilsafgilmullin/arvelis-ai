# ARVELIS AI — Location Directory Persistence & Ranking Foundation V1

**Статус документа:** engineering foundation, не production activation.

**Дата:** 2026-09-17.

## Цель

Зафиксировать provider-neutral persistence contract, стабильную внутреннюю identity policy и deterministic ranking для Travel Location Directory перед добавлением реальных SQLite/PostgreSQL adapters и перед любым live transport binding.

Этот slice намеренно отделяет **семантику хранения и разрешения** от production database implementation.

## Source of truth / parent

Parent checkpoint:

- Draft PR #45 `Project State & CI Sync V1`;
- branch `feat/project-state-sync-v1`;
- exact parent HEAD `efbd6d97c2200f06b0be3dc7425c0133c0e275e4`;
- parent validation run `35268650048` — SUCCESS.

Текущая feature branch:

- `feat/travel-location-directory-persistence-ranking-v1`.

## Что добавлено

### 1. Provider-neutral persistence contract

`server/travel/locationDirectoryFoundation.ts` задаёт:

- `LocationDirectoryRevisionV1`;
- `LocationDirectorySourceLocationV1`;
- `StoredLocationDirectoryRecordV1`;
- `LocationDirectoryRepository`;
- `LocationDirectoryIngestionService`;
- `RepositoryTravelLocationDirectory`;
- strict validation;
- canonical normalized-name policy;
- deterministic ranking policy.

`InMemoryLocationDirectoryRepository` используется только как deterministic reference implementation для qualification tests. Он **не является durable/production storage**.

### 2. Stable ARVELIS location identity

External source identity и ARVELIS identity разделены.

- GeoNames `geonameId` хранится только как `externalSourceId` внутри persistence boundary;
- trusted user/model-facing identity имеет форму `arvelis:location:*`;
- одна и та же `(source, externalSourceId)` сохраняет тот же ARVELIS `locationId` при обновлении source revision;
- новый source revision не должен автоматически создавать новый ARVELIS location identity;
- collision или некорректный ID fail-closed.

Это означает, что `geonameId -> arvelis:*` direct aliasing по-прежнему запрещён.

### 3. Source revision / provenance

Каждый импортируемый dataset revision содержит как минимум:

- source;
- country;
- source modified date;
- retrieval time;
- source fingerprint;
- license;
- attribution URL.

Повторная регистрация той же revision с другим содержимым считается conflict и отклоняется.

### 4. GeoNames adapter

`server/travel/locationSources/geonamesDirectoryAdapter.ts` переводит уже валидированные:

- GeoNames manifest → internal directory revision;
- GeoNames source seed → provider-neutral source location record.

Admin codes не выдаются за human-readable region names. Их дальнейшее безопасное обогащение — отдельный slice.

### 5. Exact normalized lookup

Foundation использует только exact normalized-name lookup:

- Unicode NFKC;
- trim;
- collapse whitespace;
- locale-aware lowercase (`ru-RU`).

Fuzzy matching, transliteration inference и semantic location guessing здесь намеренно отсутствуют.

### 6. Ranking

При нескольких exact matches ranking детерминирован:

1. explicit region match;
2. primary display-name match вместо alias-only match;
3. explicit type preference из query;
4. population;
5. stable lexical tie-breakers.

Ranking влияет только на порядок кандидатов.

**Ranking сам по себе не превращает несколько кандидатов в `resolved`.**

Если после фильтрации остаётся несколько location identities, внешний `LocationResolutionService` возвращает `ambiguous`.

### 7. Ambiguity safety fix

Предыдущий public query contract допускал `limit: 1`.

Это небезопасно: directory с несколькими совпадениями мог вернуть только первый элемент, после чего `LocationResolutionService` видел массив длины 1 и ошибочно объявлял его `resolved`.

В этом slice:

- minimum public `limit` повышен до `2`;
- `limit: 1` отклоняется как invalid query;
- внутренний exact lookup собирает bounded set до `512` совпадений;
- ranking выполняется **до** public truncation.

Controlled RU GeoNames evaluation ранее показал max normalized-primary-name multiplicity `405`, поэтому bound `512` покрывает измеренный максимум с запасом и одновременно не делает lookup unbounded.

## Security / privacy properties

- browser/model contract не получает provider-specific code;
- browser/model contract не получает GeoNames `geonameId`;
- raw source aliases не становятся отдельным trusted identity;
- malformed records rejected before persistence semantics;
- unknown/unregistered revision rejected;
- conflicting revision metadata rejected;
- ambiguity сохраняется fail-closed;
- global directory не использует `accountScopeId` для data partitioning, потому что location catalog не содержит пользовательских данных.

## Tests

Новый deterministic smoke gate проверяет:

- normalization;
- запрет `limit: 1`;
- GeoNames manifest → revision;
- GeoNames seed → internal persistence record;
- stable ARVELIS ID across source revisions;
- revision conflict;
- unknown revision rejection;
- duplicate normalized aliases rejection;
- exact lookup;
- country/type filtering;
- primary-name ranking;
- explicit region ranking;
- unresolved / resolved / ambiguous semantics;
- отсутствие external source IDs в public candidate response.

Команда:

`npm run test:location-directory-foundation`

Она также включена в `npm run check` и отдельным шагом в ARVELIS CI.

## Что НЕ входит в этот slice

Не реализуются и не активируются:

- PostgreSQL location tables;
- SQLite location tables;
- production durable repository adapter;
- реальный dataset import в application database;
- migration `004`;
- provider-specific Yandex bindings;
- live Yandex network call;
- Routes UI activation;
- fuzzy/autocomplete search;
- background refresh jobs;
- production deployment;
- merge в `main`.

Поэтому этот slice нельзя описывать как «production Location Directory готов».

## Следующий безопасный pass

После зелёного exact-head CI:

**Location Directory SQL Persistence V1**

План:

1. additive migration `004_location_directory_foundation.sql`;
2. PostgreSQL durable repository implementation;
3. SQLite development/test implementation с тем же contract;
4. stable source identity mapping;
5. revision + source records + normalized search-name index;
6. transaction-safe idempotent upsert;
7. migration and repository compatibility tests;
8. никаких live provider/UI activations.

После SQL persistence отдельно проектируется trusted `ARVELIS locationId -> Yandex provider binding` layer.
