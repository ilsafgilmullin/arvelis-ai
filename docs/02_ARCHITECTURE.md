# ARVELIS AI — архитектура

**Актуальность:** Transport Normalized Route Contract V1, 2026-09-09.

## Принципы

- `Trip` — основной product aggregate;
- UI, domain, persistence, orchestration и provider adapters разделены;
- account ownership определяется trusted server session;
- provider output считается untrusted до deterministic validation;
- provenance/freshness обязательны для внешних фактов;
- external providers заменяемы;
- secrets только server-side/protected environment;
- fake AI/transport/legal data не подменяет реальный backend.

## Stack / нижние слои

- React `19.2.8`, TypeScript `6.0.3`, Vite `8.2.1`;
- Node `>=22.12.0 <27`, CI Node `24.19.0`;
- authenticated Trip persistence через same-origin `/api/trips`;
- SQLite closed-test + PostgreSQL 18.4-compatible adapter;
- Plan V1 typed contract/orchestration policy завершён отдельным stacked Draft PR #29.

## Plan boundary

`PlanRequest` передаёт минимизированный Trip snapshot будущему AI provider. `PlanProposal` имеет explicit sources/claims/provenance. Critical model inference не становится authoritative external fact без source-backed evidence.

Реальный AI/RAG не подключён.

## Transport normalized contract

`src/travel/transportContracts.ts` добавляет provider-independent layer.

### Search request

`TransportSearchRequest` содержит только transport-relevant constraints:

- version;
- Trip ID/revision;
- traveler count;
- budget limit;
- transport preference hints;
- exact outbound/return legs.

Не передаются session/owner credentials, traveler identities, documents или full Trip aggregate.

V1 требует explicit destination и exact dates. Unknown destination/flexible dates fail closed, а не преобразуются в выдуманные параметры.

### Normalized response

`TransportSearchResponse` содержит:

- provider ID;
- request ID;
- retrieved timestamp;
- normalized routes.

Route содержит provider route ID, segments, optional price, availability, optional validity deadline и optional HTTPS source URL.

Segment нормализует mode, origin/destination, departure/arrival и optional carrier/service metadata.

Price хранится как integer minor units + ISO 4217-like 3-letter currency code. Float price semantics в contract не используются.

## Validation

Provider response валидируется до использования:

- contract version;
- provider/request identity match;
- bounded route/segment counts;
- unique IDs;
- timestamp/URL/value shape;
- non-negative safe integer price;
- chronological route segments;
- no overlapping/backward segment chronology;
- validity deadline cannot predate retrieval time.

Malformed response fail closed.

## Freshness / authority policy

Route external facts считаются current только при explicit `validUntil`, который ещё не истёк.

`TransportRoutePolicy` отдельно отмечает:

- schedule authoritative;
- price authoritative;
- availability authoritative.

Route без freshness bound получает `unspecified` и не выдаётся за current authoritative schedule/price/availability.

## Comparison policy

`compareTransportRoutes()` использует только прозрачные deterministic criteria:

- duration;
- transfer count;
- price.

Нет composite/fake recommendation score.

Price comparison разрешён только при:

1. current price у каждого route;
2. наличии price у каждого route;
3. одной валюте.

Mixed currencies возвращают `mixed_currency`; автоматический FX conversion не выполняется до отдельного Currency contract/provider решения.

Stale/unbounded routes не сравниваются как current real-data results.

## Transport provider port

`TransportProvider.searchRoutes()` typed:

`TransportSearchRequest + TransportProviderRequestContext + AbortSignal → TransportSearchResponse`.

Конкретный vendor/API schema не зашит.

## Server orchestration

`server/travel/transportOrchestrator.ts`:

1. validates account scope;
2. enforces Trip ownership;
3. builds minimized request;
4. returns honest `not_connected` if no provider;
5. applies timeout/cancellation;
6. validates provider output;
7. calculates per-route authority/freshness policy;
8. returns response + policy + minimal audit metadata.

No automatic Trip mutation, booking or fallback.

## Audit

Transport audit содержит request ID, Trip ID/revision, provider ID, timestamps/duration, status и validation codes. Route payload, user documents, cookies и provider keys в audit не пишутся.

## CI

Push gate:

- dependency audit;
- project typecheck;
- Plan policy regression;
- Transport contract/freshness smoke;
- Trip ownership regression;
- server runtime build;
- one server-backed Chromium regression;
- frontend build.

Stacked PR дополнительно прогоняет PostgreSQL 18.4 persistence regression. CI permissions остаются `contents: read`.

## Product/engineering decision boundary

Следующий Transport step уже требует выбрать real provider strategy: aviation/rail/bus coverage, Russia access, vendor API terms/costs, rate limits, freshness semantics, booking/deeplink policy, credentials and lock-in.

Этот выбор contract layer не делает автоматически.
