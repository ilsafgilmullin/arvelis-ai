# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider quotas/cost controls остаются backend policy и не меняют `Trip`.

## Current engineering slice

`Map Provider Foundation & Route Map V1` развивается в `feat/travel-map-provider-foundation-v1` поверх закрытого `Yandex Rasp Live Adapter V1` (Draft PR #32).

Ни один реальный map provider, SDK, API key или production map endpoint не подключён.

## Map architecture

`src/travel/mapContracts.ts` задаёт provider-neutral `MapRouteRequest/MapRouteResponse`:

- origin/destination и реальные сохранённые waypoints;
- bounded coordinates and route geometry;
- provider/request identity;
- attribution;
- retrievedAt + optional validUntil;
- no invented freshness.

`MapOrchestrator` проверяет authenticated ownership, timeout/cancellation и untrusted provider response до использования. User-provided coordinates не могут быть молча заменены provider-ом: response с `resolution: provided` обязан вернуть те же coordinates.

Route without provider `validUntil` имеет freshness `unspecified` и не считается authoritative-current.

## Route Map UI

В обычном runtime map provider всё ещё `not_connected`. Map tab показывает truthful empty state. Старая декоративная псевдолиния маршрута скрыта, чтобы не выглядеть как рассчитанный маршрут без фактических данных.

Сохранённые пользователем MapPoint остаются частью Trip foundation; новый normalized provider response автоматически в Trip не записывается.

## Verification

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

`test:transport-provider-foundation` в текущем slice дополнительно запускает Map provider foundation business/security smoke.

## Boundaries

- no real Map credentials/provider activation;
- no fake route geometry as user data;
- no booking/payment;
- no production deploy;
- no merge to `main`;
- no persistent provider map result storage without a separate retention/terms decision.

После green Map checkpoint следующий согласованный slice — `Legal Sources & Travel Legal Foundation V1`.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/49_MAP_PROVIDER_FOUNDATION_ROUTE_MAP_V1.md`.
