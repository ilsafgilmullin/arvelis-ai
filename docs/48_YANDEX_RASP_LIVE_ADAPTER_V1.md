# Yandex Rasp Live Adapter V1

**Date:** 2026-09-09  
**Branch:** `feat/travel-yandex-rasp-live-adapter-v1`  
**Base:** Transport Provider Strategy & Adapter Foundation V1 / `c73deed052b0f94b5cbf791aa0385879fb073e43`  
**Implementation SHA:** `df835cf92221cad3edb5d29b8e71a9f0a132ecf4`

## Goal

Добавить реальный server-side HTTP adapter для Яндекс Расписаний поверх уже утверждённого provider-neutral Transport contract, **без production activation**.

Slice заканчивается после green stacked Draft PR regression на documentation HEAD. Реальный API key, production wiring, booking/payment и другие provider adapters не входят в DoD.

## Product / provider boundary

ARVELIS AI остаётся бесплатным user-facing продуктом.

Yandex-specific условия не записываются в `Trip` и не меняют Travel Domain.

Сохраняются invariants Provider Foundation:

- provider adapter заменяем;
- activation fail closed;
- credentials только server-side env;
- provider output untrusted до validation;
- attribution сохраняется как presentation metadata;
- temporary cache only;
- no silent/mock fallback;
- no booking/payment;
- no persistent provider result storage.

## Official policy snapshot used by the slice

Повторная review была выполнена перед реализацией 2026-09-09.

Зафиксированные official references:

- Terms: https://yandex.ru/legal/timetable_api/ru/
- API docs: https://yandex.ru/dev/rasp/doc/ru/
- Access: https://yandex.ru/dev/rasp/doc/ru/concepts/access
- Point-to-point: https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point
- Stations list: https://yandex.ru/dev/rasp/doc/ru/reference/stations-list
- Copyright / attribution: https://yandex.ru/dev/rasp/doc/ru/reference/query-copyright

Engineering interpretation для V1:

- использовать только как provider для текущего бесплатного публичного продукта при соблюдении актуальных terms;
- API key обязателен, но не хранится в repository;
- attribution обязательна у provider-derived presentation;
- long-lived/persistent copy provider data не создаётся;
- разрешён только bounded temporary operational cache;
- numerical quota не выдумывается и должна быть explicitly confirmed до activation;
- `et_marker` не является наличием мест;
- отсутствие provider validity нельзя заменять ARVELIS `validUntil`.

Этот snapshot не является вечным разрешением на production use. Перед фактической activation terms/quota проверяются заново.

## Implementation structure

### `server/travel/providers/yandexRaspHttpClient.ts`

Real HTTP client на native Node `fetch`.

Default production base URL:

`https://api.rasp.yandex-net.ru/v3.0/`

Client реализует:

- `GET search/`;
- `GET stations_list/`;
- `Authorization` header для API key;
- no API key query parameter;
- `Accept: application/json`;
- `redirect: error`;
- abort propagation;
- response size limits;
- strict response parsing;
- typed sanitized errors.

Production base URL валидируется как HTTPS + approved hostname. Insecure HTTP endpoint допускается только при explicit `allowInsecureTestEndpoint` для локального test stub.

### Response bounds

- point-to-point search: максимум 4 MiB;
- station directory: максимум 56 MiB;
- search segments: максимум 100;
- ticket places per segment: bounded;
- invalid/malformed response fail closed.

Raw response body не становится audit/log payload автоматически.

## Location resolution

### `YandexRaspStationsLocationResolver`

Resolver загружает официальный `stations_list` и ищет provider code вне Travel Domain.

Algorithm:

1. trim + whitespace normalization + ru-RU lowercase;
2. exact settlement title match;
3. если settlement match отсутствует — exact station title match;
4. deduplicate by Yandex code;
5. один unique match → resolved code;
6. zero/multiple matches → `null`;
7. adapter прекращает request fail closed.

V1 сознательно не делает fuzzy matching/geocoding guesses.

User labels (`Казань`, `Сочи` и т.п.) остаются canonical input в `TransportSearchLeg`; Yandex codes не добавляются в `Trip`.

## Point-to-point request mapping

Каждый normalized leg превращается в Yandex request:

- `format=json`;
- `lang=ru_RU`;
- `from=<resolved code>`;
- `to=<resolved code>`;
- `date=<exact leg date>`;
- `limit=100`;
- `transfers=false`.

V1 не строит самостоятельные multi-transfer combinations поверх provider results.

## Response mapping

Existing `YandexRaspTransportAdapter` нормализует provider segment в `NormalizedTransportRoute`.

Сохраняются:

- `legId`;
- provider thread/route identity;
- normalized transport mode;
- from/to labels/codes;
- departure/arrival;
- carrier;
- service number;
- optional price;
- provider source URL.

### Price

Если `tickets_info.places` содержит корректные цены в одной валюте, берётся минимальная валидная цена и маркируется:

`semantics: from`

Это не guaranteed final quote.

Если currencies mixed или price malformed, adapter не выдумывает единую цену.

### Availability

`et_marker` означает provider-specific electronic-ticket marker и **не** считается availability.

Yandex V1 возвращает:

`availability: unknown`

до появления отдельного авторитетного provider signal.

### Freshness

Adapter не создаёт synthetic `validUntil`.

Response содержит фактический `retrievedAt` текущего HTTP fetch. Без provider validity normalized route остаётся freshness `unspecified` и не считается authoritative-current только потому, что попал в application cache.

## Attribution contract

`YANDEX_RASP_ATTRIBUTION`:

- text: `Данные предоставлены сервисом Яндекс.Расписания`;
- URL: `https://rasp.yandex.ru/`;
- placement: `adjacent_to_data`.

Attribution находится в provider/application layer, а не в `Trip`.

Live UI presentation/wiring в этот slice не выполняется; metadata уже готова для будущего approved presentation layer.

## Temporary cache

### Search cache

`TemporaryCachedTransportProvider`:

- process-memory only;
- default TTL: 60 seconds;
- max entries: 64;
- bounded allowed TTL: 1 second — 5 minutes;
- oldest map entry evicted при capacity;
- cache hit clones response;
- исходный provider `retrievedAt` сохраняется;
- caller-specific `requestId` обновляется.

### Station directory / location cache

- process-memory only;
- default TTL: 15 minutes;
- maximum configured TTL: 30 minutes;
- concurrent directory load deduplicated через in-flight promise;
- resolved `null` также временно кэшируется, чтобы не повторять дорогой directory scan внутри TTL.

### Persistence prohibition

Yandex provider data не сохраняется в:

- Trip aggregate;
- SQLite;
- PostgreSQL;
- localStorage;
- filesystem;
- long-lived document/archive store.

Cache TTL — только application operational bound, не provider guarantee.

## Runtime activation factory

### `createYandexRaspLiveProvider()`

Factory читает:

```text
YANDEX_RASP_API_KEY
YANDEX_RASP_TERMS_RECHECKED_AT
YANDEX_RASP_QUOTA_CONFIRMED
```

Activation context всегда использует текущую product model `free_public`.

`ready` возможен только если existing `evaluateTransportProviderActivation()` подтверждает:

- fresh terms review;
- compatible product model;
- credentials configured;
- quota confirmed;
- остальные descriptor gates.

Если gate не проходит:

```text
status = disabled
provider = null
```

и blockers возвращаются application layer.

Это сохраняет existing truthful `TransportOrchestrator` behavior: отсутствие активного provider → `not_connected`.

## `.env.example`

Добавлены только placeholders:

```text
YANDEX_RASP_API_KEY=
YANDEX_RASP_TERMS_RECHECKED_AT=
YANDEX_RASP_QUOTA_CONFIRMED=false
```

Ни один real credential в repository не добавлен.

## Test strategy

User-approved signal set оставлен компактным.

### Typecheck / build

- project strict typecheck;
- server runtime build;
- frontend build.

### Provider foundation regression

Existing Provider Foundation smoke продолжает проверять activation policy, price semantics, `et_marker`, leg identity и no invented validity.

### `test:yandex-rasp-live`

Один server-side real HTTP happy-path запускает локальный stub/fake endpoint.

Он проверяет:

- fake test key передаётся только в `Authorization`;
- request URL не содержит API key;
- `stations_list` location resolution;
- outbound + return exact dates;
- `transfers=false`;
- normalized leg mapping;
- `from` price semantics;
- `et_marker` remains `unknown` availability;
- no synthetic `validUntil`;
- freshness remains `unspecified`;
- repeated request использует temporary cache;
- cache hit не обновляет provider retrieval timestamp;
- missing env credentials дают disabled provider;
- existing `TransportOrchestrator` возвращает truthful `not_connected` без active provider.

Тест не использует настоящий Yandex key и не выполняет live Yandex network request.

### Lower-layer regression

Stacked Draft PR также обязан пройти PostgreSQL 18.4 migrations + Trip persistence/ownership regression, чтобы доказать отсутствие регрессии нижнего слоя.

## Security properties

- provider key server-side only;
- key not in query/URL;
- no key in logs/errors/docs/PR;
- approved HTTPS production host only;
- redirects disabled;
- bounded response reads;
- malformed input fail closed;
- ambiguous location fail closed;
- provider output normalized + validated;
- no booking/payment side effect;
- no automatic Trip mutation;
- temporary memory-only cache;
- no production secret wiring in this slice.

## Explicit non-goals

Yandex Rasp Live Adapter V1 не включает:

- фактическую установку live API key;
- production environment activation;
- production traffic rollout;
- live UI data wiring;
- booking/ticket purchase;
- payment;
- persistent Yandex result storage;
- Aviasales Search API;
- Aviasales Data live adapter;
- Tutu/other provider adapters;
- provider-specific изменение `Trip`;
- merge в `main`.

## Definition of Done

Slice можно объявить CLOSED только после:

1. implementation code на текущей stacked branch;
2. README/Architecture/Roadmap/Security synchronized;
3. этот `docs/48_YANDEX_RASP_LIVE_ADAPTER_V1.md` добавлен;
4. stacked Draft PR создан с base `feat/travel-transport-provider-foundation-v1`;
5. PR-triggered `validate` PASS на documentation HEAD;
6. PR-triggered PostgreSQL 18.4 regression PASS на том же documentation HEAD.

После выполнения этих пунктов — **STOP перед фактической activation live API key**.

Следующий product/engineering slice автоматически не начинается.
