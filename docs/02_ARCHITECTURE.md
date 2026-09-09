# ARVELIS AI — архитектура

**Актуальность:** Yandex Rasp Live Adapter V1, 2026-09-09.

## Принципы

- `Trip` — основной product aggregate;
- UI, domain, persistence, orchestration и provider adapters разделены;
- account ownership определяется trusted server session;
- provider output считается untrusted до deterministic validation;
- provenance/freshness обязательны для внешних фактов;
- external providers заменяемы;
- provider terms/quotas/attribution/credentials находятся вне Travel Domain;
- secrets только server-side/protected environment;
- fake AI/transport/legal data не подменяет real backend.

## Нижние закрытые слои

- Travel UI V2;
- Server-side Trip Persistence & API V1;
- Plan Real-Data Contract & AI Orchestration Policy V1;
- Transport Normalized Route Contract V1 — Draft PR #30, green, not merged;
- Transport Provider Strategy & Adapter Foundation V1 — Draft PR #31, green, not merged.

## Бесплатная user-facing модель

Текущая monetization mode: `free_public`.

Billing/subscriptions/paywall не являются частью `Trip`, Transport contracts или provider ports. Если коммерческая модель когда-либо изменится, совместимость provider-а проверяется application activation policy без изменения Travel Domain.

## Transport normalized contract

`TransportSearchRequest` содержит минимизированные transport constraints. V1 требует explicit destination и exact dates.

`TransportSearchResponse` нормализует provider/request identity, `legId`, routes/segments, price, availability, retrieval/freshness и source URL.

Price хранится как integer minor units + currency и имеет explicit semantics:

- `from` — нижняя граница/минимальная заявленная цена;
- `quoted` — конкретная котировка;
- `cached_observation` — историческое/кэшированное наблюдение;
- `unknown` — semantics недостаточно определены.

Provider-specific price semantics не кодируются в `Trip`.

## Provider activation layer

Transport provider проходит отдельный activation gate до runtime wiring.

Policy проверяет:

1. актуальность official terms review;
2. совместимость с текущим `free_public` продуктом;
3. обязательную attribution/branding policy;
4. подтверждённую quota/rate-limit policy;
5. cache/storage restrictions;
6. search/deeplink/booking restrictions;
7. наличие server-side credentials;
8. отсутствие domain coupling к vendor-specific данным.

Если любой обязательный gate не подтверждён, provider остаётся disabled/not-connected.

## Yandex Rasp Live Adapter V1

Live adapter построен как отдельный server-side слой поверх уже существующего `TransportProvider` port.

### Components

- `server/travel/providers/yandexRaspHttpClient.ts` — real HTTP transport + defensive response parsing;
- `server/travel/providers/yandexRaspLiveProvider.ts` — env activation, location resolver и temporary cache;
- `server/travel/providers/yandexRaspAdapter.ts` — normalized Yandex → Transport mapping;
- `server/travel/transportOrchestrator.ts` — остаётся provider-neutral и не знает Yandex schema.

Trip Domain не менялся ради Yandex-specific codes/quotas/attribution.

## HTTP boundary

`YandexRaspHttpClient` использует native Node `fetch`.

Production default:

`https://api.rasp.yandex-net.ru/v3.0/`

Security/runtime rules:

- API key передаётся только в `Authorization` header;
- key не добавляется в URL/query string;
- production base URL обязан быть HTTPS и иметь approved hostname;
- insecure HTTP endpoint допускается только explicit test option;
- redirects запрещены;
- search response ограничен 4 MiB;
- `stations_list` response ограничен 56 MiB;
- network/HTTP/JSON/shape failures превращаются в typed sanitized errors;
- provider response body не логируется автоматически.

## Location resolution

`YandexRaspStationsLocationResolver` получает official station directory через `stations_list`.

Provider-specific codes живут только внутри adapter boundary.

Resolution algorithm:

1. normalize user label;
2. exact settlement title match;
3. если settlement match отсутствует — exact station title match;
4. duplicate codes deduplicated;
5. неоднозначность или отсутствие единственного match → `null`;
6. adapter fail closed, а не угадывает направление.

Fuzzy/geocoding guesses в V1 отсутствуют.

Directory и resolved points хранятся только в памяти. Default TTL — 15 минут; allowed TTL bounded максимум 30 минут.

## Request/response mapping

Point-to-point search отправляет:

- `format=json`;
- `lang=ru_RU`;
- resolved `from/to` codes;
- exact date;
- `limit=100`;
- `transfers=false`.

Normalized mapping сохраняет:

- original `legId`;
- provider route/thread identity;
- transport mode;
- station labels/codes;
- departure/arrival;
- carrier/service number;
- optional price.

`et_marker` **не** является availability. V1 возвращает `availability: unknown`.

Если tickets places дают валидную цену в одной валюте, минимум нормализуется как `price.semantics = from`. Mixed-currency price list не сливается в fake single price.

## Attribution

Live provider state содержит обязательный presentation contract:

- text: `Данные предоставлены сервисом Яндекс.Расписания`;
- URL: `https://rasp.yandex.ru/`;
- placement: `adjacent_to_data`.

Attribution metadata находится вне `Trip`. Production UI wiring в этот slice не выполняется.

## Freshness / temporary cache

Yandex adapter не изобретает provider `validUntil`.

`retrievedAt` — время фактического provider fetch. Если provider validity отсутствует, normalized route freshness остаётся `unspecified` и не становится authoritative-current только из-за локального cache TTL.

`TemporaryCachedTransportProvider`:

- хранит responses только в process memory;
- default search TTL — 60 секунд;
- max entries — 64;
- cache hit сохраняет исходный provider `retrievedAt`, меняя только request-scoped `requestId`;
- не пишет response в Trip persistence/SQLite/PostgreSQL/localStorage/files.

Application TTL означает только допустимый возраст temporary cache.

## Runtime activation

`createYandexRaspLiveProvider()` читает только server-side environment:

- `YANDEX_RASP_API_KEY`;
- `YANDEX_RASP_TERMS_RECHECKED_AT`;
- `YANDEX_RASP_QUOTA_CONFIRMED`.

Factory вызывает existing `evaluateTransportProviderActivation()` с product model `free_public`.

Provider становится `ready` только когда terms review свежая, credentials присутствуют и quota explicitly confirmed. Иначе:

- `status: disabled`;
- `provider: null`;
- blockers возвращаются вызывающему application layer;
- `TransportOrchestrator` сохраняет truthful `not_connected` behavior.

`.env.example` содержит только пустые placeholders/false. Production secret wiring не выполнялся.

## Server orchestration

`TransportOrchestrator` остаётся provider-neutral:

1. проверяет account scope и Trip ownership;
2. строит minimized request;
3. возвращает `not_connected`, если provider не активирован;
4. применяет timeout/cancellation;
5. валидирует normalized output;
6. вычисляет route policy;
7. не мутирует Trip автоматически;
8. не выполняет booking/purchase.

## Audit / secrets

Audit не хранит provider response body, API keys, auth headers, cookies, документы или payment data.

Provider credentials никогда не передаются во frontend и не являются частью normalized request/context.

## CI

Signal-bearing gates для Yandex V1:

- dependency audit;
- project typecheck;
- Transport Provider Foundation regression;
- `Yandex Rasp live adapter HTTP and freshness` — local real HTTP stub, fake key only;
- Trip ownership / TransportOrchestrator regression;
- server runtime build;
- один server-backed Chromium happy-path;
- frontend build;
- stacked PR: PostgreSQL 18.4 lower-layer regression.

CI permissions: `contents: read`.

## Decision / STOP boundary

После green PR-triggered regression на documentation HEAD `Yandex Rasp Live Adapter V1` закрывается как implementation slice.

Это **не** означает production activation. Отдельного подтверждения требуют:

- фактический live API key;
- production environment wiring;
- fresh terms/quota confirmation непосредственно перед activation;
- UI presentation of live Yandex data/attribution;
- любые booking/payment flows.

Другие provider adapters в этом slice не подключаются.
