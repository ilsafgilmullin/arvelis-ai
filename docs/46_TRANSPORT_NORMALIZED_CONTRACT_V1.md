# ARVELIS AI — Transport Normalized Route Contract V1

**Дата:** 2026-09-09  
**Branch:** `feat/travel-transport-contract-v1`  
**Base:** `feat/travel-plan-orchestration-contract-v1` / `7e99c1f118f037fcf90b488a1c2b24e409bedcf6`

## Цель

Зафиксировать provider-neutral transport contract, validation, freshness и deterministic comparison до подключения конкретного транспортного API.

Slice не подключает реальные рейсы/цены/бронирование и не утверждает конкретного vendor.

## Request contract

`TransportSearchRequest` формируется из минимального набора Trip constraints:

- `version`;
- `tripId`;
- `tripRevision`;
- `travelerCount`;
- `budgetLimitRub`;
- `transportPreferenceHints`;
- outbound/return legs.

V1 требует:

- известный destination;
- exact dates;
- минимум одного traveller.

Flexible dates и неизвестный destination fail closed до отдельного discovery/flexible-search contract.

`ownerScopeId`, auth/session credentials, traveler identity labels, документы и полный Trip aggregate в provider request не включаются.

## Normalized response

`TransportSearchResponse` содержит:

- contract version;
- provider ID;
- request ID;
- retrieval time;
- normalized routes.

Route содержит:

- internal normalized route ID;
- provider route ID;
- ordered segments;
- optional `TransportMoney`;
- availability;
- optional `validUntil`;
- optional HTTPS source URL.

Segment нормализует mode, from/to, departure/arrival и optional carrier/service metadata.

Price хранится как integer minor units + three-letter currency. Float money contract не используется.

## Validation

До использования provider response проверяются:

- contract version;
- provider/request identity;
- array bounds;
- unique IDs;
- timestamp/value/URL shape;
- price integer/range/currency;
- segment chronology;
- no backward/overlapping route chronology;
- `validUntil >= retrievedAt`.

Invalid response fail closed и не превращается в успешный transport result.

## Freshness / authority

Transport external facts имеют отдельную authority policy.

Route считается current только при explicit `validUntil`, не истёкшем на момент evaluation.

Отдельно вычисляются:

- `scheduleAuthoritative`;
- `priceAuthoritative`;
- `availabilityAuthoritative`.

Route без freshness bound не выдаётся за current authoritative result.

## Comparison

`compareTransportRoutes()` поддерживает только прозрачные критерии:

- duration;
- transfers;
- price.

Opaque composite recommendation score отсутствует.

Price comparison разрешён только если:

1. каждый route current;
2. у каждого route есть current authoritative price;
3. currency одинаковая.

Mixed currency возвращает explicit non-comparable result; FX conversion не выполняется автоматически.

## Provider port

`TransportProvider.searchRoutes()`:

`TransportSearchRequest + TransportProviderRequestContext + AbortSignal -> TransportSearchResponse`.

Vendor schema находится за adapter boundary и не должен менять Travel Domain.

## Server orchestrator

`TransportOrchestrator`:

1. проверяет account scope;
2. проверяет Trip ownership;
3. формирует минимизированный request;
4. возвращает `not_connected` без fake data при отсутствии provider;
5. применяет timeout/cancellation;
6. валидирует provider response;
7. рассчитывает authority/freshness policy;
8. возвращает normalized response + policy + minimal audit metadata.

Orchestrator не выполняет booking, payment или automatic Trip mutation.

## Product boundary

ARVELIS AI на текущем этапе полностью бесплатный user-facing сервис.

Transport contract не содержит billing/subscription/paywall semantics. Внутренняя provider quota/cost protection допустима на server/application layer и не должна попадать в `Trip` или normalized route domain.

## Real provider gate

Перед любым adapter implementation нужно отдельно проверить официальные актуальные:

- terms of use;
- бесплатный/платный access model;
- attribution;
- rate limits/quotas;
- caching/storage restrictions;
- price/availability display rights;
- deeplink/affiliate/booking rules;
- Russia/backend availability;
- credentials handling;
- termination/change-of-terms risk.

Результат должен быть оформлен как provider strategy decision, а не как implicit assumption в adapter code.

## Verification

Implementation push после исправления strict TypeScript/test harness:

- `npm audit --audit-level=high` — PASS;
- `npm run typecheck` — PASS;
- `npm run test:plan-policy` — PASS;
- `npm run test:transport-policy` — PASS;
- `npm run test:trip-server` — PASS;
- `npm run build:auth-server` — PASS;
- server-backed Chromium happy-path — PASS;
- `npm run build` — PASS.

Stacked Draft PR дополнительно должен пройти PostgreSQL 18.4 persistence regression нижнего слоя.

## Non-goals

- real transport provider;
- booking/purchase;
- payment/billing/paywall;
- currency provider;
- real AI/RAG;
- production deployment;
- merge to `main`;
- destructive migrations.
