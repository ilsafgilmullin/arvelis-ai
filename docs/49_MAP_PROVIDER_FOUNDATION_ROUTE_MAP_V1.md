# Map Provider Foundation & Route Map V1

**Date:** 2026-09-09  
**Branch:** `feat/travel-map-provider-foundation-v1`  
**Base:** Yandex Rasp Live Adapter V1 / `dc7da2ab920411bb39105c368e16ae90dcd0ef90`

## Goal

Создать provider-neutral Map boundary и безопасную основу Route Map без выбора/активации внешнего картографического vendor-а.

## Contract

`MapRouteRequest` содержит только map-relevant данные:

- Trip ID/revision;
- origin;
- destination;
- сохранённые user waypoints;
- user coordinates только если они уже есть в Trip.

`MapRouteResponse` нормализует:

- provider/request identity;
- resolved points;
- bounded geometry;
- distance/duration, если provider реально их дал;
- attribution;
- `retrievedAt`;
- optional provider `validUntil`.

`validUntil` никогда не выдумывается ARVELIS.

## Security and validation

Provider response считается untrusted input.

Validation проверяет:

- bounded point/route/geometry counts;
- latitude `[-90, 90]`;
- longitude `[-180, 180]`;
- unique IDs;
- request/provider identity;
- requested-point membership;
- HTTPS source/attribution URLs;
- non-negative safe integer distance/duration;
- integrity of user-provided coordinates.

Если point помечен как `resolution: provided`, provider не имеет права заменить исходную user coordinate.

## Orchestration

`MapOrchestrator`:

1. проверяет authenticated account scope;
2. проверяет Trip ownership;
3. строит minimized Map request;
4. возвращает `not_connected`, если provider отсутствует;
5. применяет timeout/cancellation;
6. валидирует response;
7. вычисляет freshness policy;
8. не мутирует Trip автоматически.

## Freshness

- provider `validUntil` в будущем => `current`;
- истёкший `validUntil` => `expired`;
- отсутствие `validUntil` => `unspecified`.

`unspecified` geometry не называется authoritative-current route.

## Route Map UI

До реального Map provider пользователь не получает искусственную карту.

Старая декоративная псевдолиния в Map empty state скрыта. UI остаётся truthful: карта маршрута появится только после подключения реального картографического сервиса.

## Persistence

Normalized provider map response не сохраняется автоматически в Trip/SQLite/PostgreSQL. Existing `Trip.mapPoints` остаются отдельными user/provider points из foundation model.

Retention/cache policy для конкретного map vendor-а проверяется перед его adapter activation.

## Tests

Signal-bearing Map smoke проверяет:

- minimized request;
- ownership fail closed;
- truthful `not_connected`;
- valid normalized geometry;
- request identity rejection;
- user-coordinate integrity;
- freshness current/expired/unspecified.

Один существующий server-backed Chromium happy-path остаётся UI regression gate.

## Non-goals

- no real map provider/SDK;
- no production API key;
- no fake route geometry;
- no offline maps;
- no navigation/turn-by-turn;
- no production deployment.

Следующий согласованный stacked slice после green DoD: `Legal Sources & Travel Legal Foundation V1`.
