# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first: white / soft blue-white surfaces, teal/blue/green palette, side drawer и Trip Workspace. Геометрия бренда не менялась: `A`, круговая орбита и точечная дуга сохранены.

## Текущий engineering slice

`Plan Real-Data Contract & AI Orchestration Policy V1` развивается в stacked-ветке `feat/travel-plan-orchestration-contract-v1` поверх завершённого `Server-side Trip Persistence & API V1` (`feat/travel-trip-persistence-v1`, Draft PR #28).

Draft PR текущего Plan slice: **#29**. Merge не выполняется.

Цель — определить строгий server-side contract между Trip, будущими verified provider facts и будущим AI reasoning **до подключения реальной модели, RAG или travel provider**.

## Plan contract V1

`src/travel/planContracts.ts` фиксирует:

- `PlanRequest` с минимизированным immutable Trip snapshot;
- `PlanProposal` как структурированный результат;
- `PlanSourceReference`;
- `PlanClaim`;
- provenance: `user_input | provider_fact | model_inference | unknown`;
- confidence и source references;
- destination / itinerary suggestions;
- assumptions;
- deterministic validation до использования результата.

В PlanRequest намеренно не передаются owner/session credentials, traveler labels, legal/map state, документы, secrets и полный Trip aggregate.

## AI orchestration policy

`AIProvider.planTrip()` больше не возвращает `unknown`. Он принимает typed `PlanRequest`, typed provider context и `AbortSignal`, возвращая `PlanProposal`.

`server/travel/planOrchestrator.ts` задаёт server policy:

- Trip owner должен совпадать с authenticated account scope;
- real provider может отсутствовать — это честное `not_connected`;
- timeout ограничивает provider call;
- caller cancellation распространяется через `AbortSignal`;
- provider output считается untrusted до `validatePlanProposal`;
- invalid provider response fail closed;
- silent fallback на fake/local answer отсутствует;
- orchestration не пишет Plan автоматически в Trip;
- audit содержит только request/provider/trip metadata, timestamps/status и validation codes, но не prompt/response body и не secrets.

## Real-data / provenance rules

Критические внешние факты (`transport_schedule`, `price`, `availability`, `legal`, `weather`) не становятся authoritative только потому, что их сгенерировала модель.

- `provider_fact` обязан ссылаться на declared source;
- legal provider fact требует official HTTPS source;
- model inference остаётся advisory/non-authoritative;
- expired provider evidence не используется как authoritative;
- user input может быть authoritative только как пользовательское утверждение, а не как подтверждение внешнего факта;
- unknown provenance не повышается до verified автоматически.

Это contract policy, а не факт подключения реальных источников.

## Persistence / auth foundations

Server-side Trip Persistence V1 закрыт в Draft PR #28:

- authenticated account → same-origin `/api/trips`;
- SQLite closed-test persistence;
- PostgreSQL 18.4-compatible persistence;
- server-authoritative ownership/timestamps;
- preview остаётся explicit local-only mode.

Passwordless Email OTP / HttpOnly session foundation не переписывалась.

## AI truth boundary

На текущем этапе **не подключены**:

- реальная AI model/API;
- RAG/vector database;
- Transport provider;
- Map provider;
- Legal provider;
- Weather provider;
- Stay provider;
- Currency provider;
- booking/payment flow.

Fake AI replies, fake prices, fake availability, fake schedules и fake legal conclusions запрещены.

## Development

Frontend preview:

```bash
npm run dev
```

Closed-test auth runtime после настройки protected environment:

```bash
npm run dev:auth
```

## Verification

Основной gate текущего Plan slice:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:plan-policy
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

`npm run test:plan-policy` проверяет минимизацию PlanRequest, provenance/source validation, legal official-source rule, expired evidence, ownership, not-connected, cancellation, timeout и invalid provider response.

Stacked Draft PR дополнительно сохраняет PostgreSQL persistence regression gate существующего нижнего слоя.

## Release boundary

- merge в `main` — только после отдельного подтверждения;
- production deploy не выполняется;
- реальные AI/RAG/travel providers не подключаются этим slice;
- paid services не подключаются;
- destructive migrations/deletion не выполняются;
- production DB/provider region и legal/privacy rollout остаются отдельными решениями.

После зелёного Plan checkpoint следующий roadmap layer — provider-neutral **Transport / normalized route comparison contract**, до выбора конкретного внешнего transport provider.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/44_TRAVEL_TRIP_PERSISTENCE_API_V1.md` и `docs/45_PLAN_REAL_DATA_ORCHESTRATION_POLICY_V1.md`.
