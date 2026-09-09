# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя.

- billing/subscriptions/paywall не проектируются;
- Travel Domain не содержит monetization fields;
- provider quotas/cost controls остаются внутренней backend policy;
- будущая смена коммерческой модели не должна требовать изменения `Trip`.

## Current engineering state

`Yandex Rasp Live Adapter V1` реализован в stacked-ветке `feat/travel-yandex-rasp-live-adapter-v1` поверх закрытого `Transport Provider Strategy & Adapter Foundation V1` (Draft PR #31).

Implementation SHA до documentation closure: `df835cf92221cad3edb5d29b8e71a9f0a132ecf4`.

Этот slice добавляет реальный server-side HTTP adapter, но **не активирует production traffic и не содержит real API key**.

## Yandex Rasp Live Adapter V1

### HTTP client

`server/travel/providers/yandexRaspHttpClient.ts`:

- использует native Node `fetch`, без новой HTTP dependency;
- default API base: `https://api.rasp.yandex-net.ru/v3.0/`;
- передаёт API key только в `Authorization` header;
- не добавляет key в query string;
- запрещает redirects;
- принимает insecure HTTP endpoint только в явно разрешённом test mode;
- ограничивает размер search response до 4 MiB;
- ограничивает `stations_list` response до 56 MiB;
- валидирует HTTP/JSON/response shape и возвращает санитизированные ошибки.

### Location resolution

`YandexRaspStationsLocationResolver` использует официальный `stations_list` только как temporary in-memory directory.

- user labels остаются provider-neutral внутри `Trip`;
- exact settlement match имеет приоритет;
- если settlement не найден, допускается exact station match;
- ambiguous/missing match возвращает `null` и поиск fail closed;
- fuzzy guessing и запись Yandex codes в Travel Domain отсутствуют;
- directory TTL по умолчанию — 15 минут.

### Mapping / truthfulness

`YandexRaspTransportAdapter` сохраняет normalized Transport boundary.

- outbound/return привязаны к `legId`;
- `et_marker` не трактуется как наличие мест;
- Yandex ticket price нормализуется как `from`;
- mixed-currency places не превращаются в одну цену;
- provider `validUntil` не выдумывается;
- availability остаётся `unknown`, если provider не дал отдельного авторитетного факта;
- attribution contract: `Данные предоставлены сервисом Яндекс.Расписания`, placement `adjacent_to_data`.

### Temporary cache only

`TemporaryCachedTransportProvider` хранит результаты только в RAM.

- search TTL по умолчанию — 60 секунд;
- max search cache entries — 64;
- location directory TTL — 15 минут;
- cache TTL описывает возраст локального temporary cache и **не является provider validity**;
- Yandex responses не записываются в Trip persistence, SQLite, PostgreSQL, localStorage или файлы.

## Activation gate

Runtime factory `createYandexRaspLiveProvider()` fail closed.

Для состояния `ready` одновременно нужны server-side environment values:

```text
YANDEX_RASP_API_KEY
YANDEX_RASP_TERMS_RECHECKED_AT
YANDEX_RASP_QUOTA_CONFIRMED=true
```

`.env.example` содержит только пустые placeholders. Реальные значения не должны появляться в Git, PR, docs, screenshots, frontend bundle или logs.

Без credentials/fresh terms review/confirmed quota provider остаётся `disabled` с `provider: null`; `TransportOrchestrator` сохраняет truthful `not_connected` behavior.

## Verification

Signal-bearing commands:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:transport-provider-foundation
npm run test:yandex-rasp-live
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

`test:yandex-rasp-live` использует локальный HTTP stub и fake test key. Он не обращается к реальному Yandex endpoint и не требует real credentials.

Stacked Draft PR на `feat/travel-transport-provider-foundation-v1` дополнительно должен пройти PR-triggered PostgreSQL 18.4 lower-layer regression.

## Explicit non-goals / STOP boundary

В этот slice **не входят**:

- фактическая activation live Yandex API key;
- production provider wiring;
- booking/ticket purchase/payment;
- persistent storage Yandex results;
- Aviasales Search API;
- Aviasales Data live adapter;
- другие transport providers;
- изменение `Trip` под provider-specific ограничения.

После green PR-triggered regression на documentation HEAD `Yandex Rasp Live Adapter V1` считается CLOSED. Следующий engineering slice самостоятельно не начинается.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/47_TRANSPORT_PROVIDER_STRATEGY_ADAPTER_FOUNDATION_V1.md`, `docs/48_YANDEX_RASP_LIVE_ADAPTER_V1.md`.
