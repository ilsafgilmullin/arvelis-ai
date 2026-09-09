# Transport Provider Strategy & Adapter Foundation V1

**Date:** 2026-09-09  
**Branch:** `feat/travel-transport-provider-foundation-v1`  
**Base:** Transport Normalized Route Contract V1 / `28ea5ab063f7e0c152ac92bffbe9c7d89a440e92`

## Goal

Зафиксировать provider strategy и adapter activation boundary до подключения реального transport API.

Foundation не активирует production traffic и не содержит provider credentials.

## Product model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя.

Billing, subscriptions и paywall не входят в Travel Domain. Совместимость provider-а с бесплатной/будущей коммерческой моделью проверяется в application activation policy.

## Provider-neutral invariants

- `Trip` не содержит vendor ID, quota, attribution, API key или tariff data;
- `TransportProvider` остаётся canonical port;
- provider output нормализуется до использования;
- provider activation fail closed;
- no silent/mock fallback;
- no booking/payment;
- no persistent provider result storage по умолчанию;
- secrets только server-side protected env.

## Activation policy

Для каждого provider фиксируется descriptor:

- provider ID;
- supported transport modes;
- official terms review date/source;
- supported product access models;
- attribution requirements;
- credential requirement;
- quota status;
- caching/storage policy;
- deeplink/booking restrictions;
- activation status/reason.

Runtime provider может быть enabled только при свежей terms review, compatible product mode, подтверждённых обязательных terms и наличии server-side credentials.

## Normalized contract hardening

Foundation уточняет Transport contract для реальных adapters.

### Route leg identity

Каждый route содержит `legId`, чтобы outbound и return results не смешивались при comparison.

### Price semantics

Price имеет explicit semantics:

- `from` — заявленная нижняя граница;
- `quoted` — конкретная котировка;
- `cached_observation` — историческое/кэшированное наблюдение;
- `unknown` — недостаточно определённая semantics.

Provider adapter не имеет права превращать `from` или cached observation в guaranteed final quote.

## Candidate review snapshot

Этот раздел — engineering snapshot на 2026-09-09. **Перед фактической activation любого API official terms проверяются повторно.**

### Yandex Rasp — primary schedule candidate

Official sources:

- Terms: https://yandex.ru/legal/timetable_api/ru/
- API documentation/access: https://yandex.ru/dev/rasp/doc/ru/concepts/access
- Point-to-point endpoint: https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point

Зафиксированная стратегия:

- подходит как schedule-oriented candidate для текущего бесплатного user-facing продукта при соблюдении действующих условий;
- attribution обязательна и должна дойти до UI presentation boundary;
- provider data нельзя превращать в постоянную локальную копию; foundation использует `temporary_cache_only`;
- API key требуется, но не хранится в коде;
- numerical quota не выдумывается: до activation требуется подтвердить quota конкретного access/key;
- `et_marker` означает возможность электронного билета в данных API и **не интерпретируется как наличие мест**;
- ticket price data нормализуется как `from`, если provider не даёт гарантированную quote semantics;
- отсутствие provider validity deadline не заменяется ARVELIS-ом выдуманным `validUntil`;
- booking/purchase не входят в scope.

### Aviasales Search API — blocked for current early-stage strategy

Official source:

- Access requirements: https://support.travelpayouts.com/hc/en-us/articles/210995808-How-to-get-access-to-the-Aviasales-Search-API
- Search API flow: https://support.travelpayouts.com/hc/en-us/articles/30565016140434-Aviasales-Flight-Search-API-real-time-and-multi-city-search

Current strategy:

- не подключать сейчас;
- published access requirements/scale gate делают его неподходящим первым live provider для раннего ARVELIS;
- booking/deeplink flow имеет отдельные user-action/partner requirements;
- adapter foundation не добавляет Search API credentials или runtime.

### Aviasales Data API — future cached price insights only

Official source:

- https://support.travelpayouts.com/hc/en-us/articles/203956083-Requirements-for-Aviasales-data-API-access

Использовать только как future candidate для cached price observations/insights. Не выдавать Data API как live search/availability source.

## Yandex adapter foundation

`YandexRaspTransportAdapter` построен через injected dependencies:

- API client port;
- location resolver;
- normalized mapping.

Foundation test использует fixtures и не выполняет live HTTP request.

Location resolver отделён от `Trip`: user labels (`Казань`, `Сочи`) не заменяются vendor-specific station codes внутри domain.

## Attribution

Attribution requirement является provider metadata, а не hard-coded глобальным UI правилом.

Для Yandex presentation layer должен уметь показать требуемую attribution рядом/в контексте provider data. Live UI wiring будет отдельным шагом после HTTP adapter.

## Caching / persistence

Provider data policy для Yandex foundation: `temporary_cache_only`.

Запрещено автоматически сохранять Yandex response/results как постоянный `Trip.transportRoutes` snapshot.

Live adapter может использовать только bounded temporary operational cache. Cache TTL является application freshness control и **не является provider guarantee**.

## Secrets

API key:

- только server-side env;
- никогда не frontend;
- никогда не Git/PR/docs/screenshots/logs;
- отсутствие key => provider disabled/not_connected.

## Tests

Signal-bearing foundation test проверяет:

- free-product compatibility;
- stale/missing terms review failure;
- credentials/quota gate;
- Yandex attribution/cache restrictions;
- `legId` mapping;
- price semantics;
- `et_marker` != availability;
- no invented provider freshness;
- future monetization incompatibility без изменения `Trip`.

Никакого live key или network access тесту не требуется.

## Next slice

`Yandex Rasp Live Adapter V1` после green Provider Foundation checkpoint:

1. real HTTP client;
2. env-only key;
3. real location resolution integration;
4. request/response mapping;
5. attribution/provenance;
6. bounded temporary cache;
7. fail-closed disabled/not_connected without key;
8. one server-side HTTP happy-path against local stub/fake endpoint;
9. no booking/payment/persistent provider result storage;
10. STOP before actual live key activation if credentials/user action are required.
