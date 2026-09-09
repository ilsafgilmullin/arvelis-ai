# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Текущий engineering slice

`Transport Normalized Route Contract V1` развивается в stacked-ветке `feat/travel-transport-contract-v1` поверх закрытого `Plan Real-Data Contract & AI Orchestration Policy V1` (`feat/travel-plan-orchestration-contract-v1`, Draft PR #29).

Цель — зафиксировать provider-neutral transport request/response, provenance/freshness и сравнение маршрутов **до выбора и подключения конкретного transport vendor**.

## Transport contract V1

`src/travel/transportContracts.ts` задаёт:

- `TransportSearchRequest` из минимизированных Trip constraints;
- exact outbound/return legs;
- normalized modes/segments/routes;
- provider route ID и request/provider identity;
- price в minor units + ISO currency;
- availability;
- `retrievedAt` / optional `validUntil`;
- optional HTTPS source URL;
- deterministic chronology/shape validation.

Flexible dates и неизвестный destination не подменяются предположением: V1 fail closed до отдельного discovery/flexible-search contract.

## Transport orchestration policy

`TransportProvider.searchRoutes()` теперь typed и получает `AbortSignal`.

`server/travel/transportOrchestrator.ts`:

- проверяет authenticated account scope и Trip ownership;
- честно возвращает `not_connected`, если provider отсутствует;
- задаёт timeout/cancellation;
- считает provider response untrusted до validation;
- отклоняет provider/request mismatch и malformed chronology;
- вычисляет freshness/authority policy;
- не пишет маршруты автоматически в Trip;
- не выполняет booking/purchase;
- не делает silent/mock fallback.

## Route comparison

V1 не использует непрозрачный «лучший маршрут» score.

Доступны deterministic criteria:

- duration;
- transfers;
- price.

Price comparison выполняется только когда все сравниваемые цены current и в одной валюте. Mixed currency не конвертируется автоматически. Stale или unbounded route data не считается authoritative current schedule/price/availability.

## Truth boundary

На текущем этапе **не подключены**:

- реальный transport provider;
- booking/ticket purchase;
- currency conversion provider;
- real AI/RAG;
- Map/Legal/Weather/Stay providers.

Fake schedules, prices, availability и booking state запрещены.

## Нижние закрытые слои

- Server-side Trip Persistence & API V1 — Draft PR #28, green, not merged;
- Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29, green, not merged.

## Verification

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:plan-policy
npm run test:transport-policy
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

Draft PR также прогоняет PostgreSQL 18.4 persistence regression нижнего слоя.

## Release / decision boundary

- merge в `main` не выполняется без отдельного подтверждения;
- production deploy и paid services не выполняются;
- реальные provider keys не добавляются;
- destructive migrations/deletion не выполняются.

После зелёного Transport V1 contract следующий шаг внутри Transport roadmap — **выбор реального provider strategy**. Это требует отдельного продуктово-технического решения по coverage (авиа/жд/автобус), доступности в России, API terms/costs, source freshness, booking/deeplink policy, credentials и vendor lock-in.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/45_PLAN_REAL_DATA_ORCHESTRATION_POLICY_V1.md` и `docs/46_TRANSPORT_NORMALIZED_CONTRACT_V1.md`.
