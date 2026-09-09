# ARVELIS AI — архитектура

**Актуальность:** Transport Provider Strategy & Adapter Foundation V1, 2026-09-09.

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
- Transport Normalized Route Contract V1 — Draft PR #30, green, not merged.

## Бесплатная user-facing модель

Текущая monetization mode: `free_public`.

Billing/subscriptions/paywall не являются частью `Trip`, Transport contracts или provider ports. Если коммерческая модель когда-либо изменится, совместимость provider-а должна проверяться application/activation policy без изменения Travel Domain.

## Transport normalized contract

`TransportSearchRequest` содержит минимизированные transport constraints. V1 требует explicit destination и exact dates.

`TransportSearchResponse` нормализует provider/request identity, `legId`, routes/segments, price, availability, retrieval/freshness и source URL.

Цена хранится как integer minor units + currency и имеет explicit semantics:

- `from` — нижняя граница/минимальная заявленная цена;
- `quoted` — конкретная котировка;
- `cached_observation` — историческое/кэшированное наблюдение;
- `unknown` — semantics недостаточно определены.

Provider-specific price semantics не кодируются в `Trip`.

## Provider strategy / activation layer

Transport provider проходит отдельный activation gate до runtime wiring.

Policy проверяет:

1. актуальность official terms review;
2. совместимость с текущим `free_public` продуктом;
3. обязательную attribution/branding policy;
4. подтверждённую quota/rate-limit policy;
5. cache/storage restrictions;
6. search/deeplink/booking restrictions;
7. наличие server-side credentials, если они требуются;
8. отсутствие domain coupling к vendor-specific данным.

Если любой обязательный gate не подтверждён, provider остаётся disabled/not-connected.

## Yandex Rasp adapter foundation

`YandexRaspTransportAdapter` существует только как чистый provider adapter поверх injected client/resolver.

Foundation:

- не содержит API key;
- не выполняет production activation;
- не делает booking/purchase;
- не трактует `et_marker` как наличие мест;
- нормализует Yandex price как `from`;
- требует provider-specific location resolution вне `Trip`;
- не создаёт фиктивный `validUntil`;
- не записывает provider result автоматически в persistent Trip storage.

Следующий отдельный slice — Yandex Rasp Live Adapter V1 — может добавить HTTP transport и env credentials, но только с fail-closed runtime wiring и temporary cache.

## Provider candidates

### Yandex Rasp

Primary schedule candidate. Official terms snapshot от 2026-09-09 совместим с бесплатным публичным продуктом при соблюдении attribution и storage restrictions. Перед фактической activation terms/quota должны проверяться повторно.

### Aviasales Search API

Не подключается сейчас. Current published access requirements делают его неподходящим для раннего ARVELIS; booking/deeplink flow имеет отдельные обязательные правила.

### Aviasales Data API

Оставлен только как future cached flight-price insights candidate; не считается live availability/search source.

## Freshness / provenance

Provider response проходит validation до использования. Route без доказуемого freshness bound не выдаётся за authoritative-current price/schedule/availability.

Yandex foundation не изобретает `validUntil`. В live slice temporary cache должен иметь собственный short application TTL, который обозначает возраст кэша, а не provider-guaranteed validity.

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

Audit не хранит provider response body, API keys, cookies, документы или payment data.

Provider credentials никогда не передаются во frontend и не являются частью normalized request/context.

## CI

Signal-bearing gates:

- dependency audit;
- project typecheck;
- Plan regression;
- Transport contract/freshness;
- Transport Provider Foundation policy/mapping;
- Trip ownership regression;
- server runtime build;
- один server-backed Chromium happy-path;
- frontend build;
- stacked PR: PostgreSQL 18.4 lower-layer regression.

CI permissions: `contents: read`.

## Decision boundary

Live Yandex Rasp activation требует отдельного env credential и повторной официальной terms/quota проверки. Ни один real provider key не должен появляться в Git, PR, logs или docs.
