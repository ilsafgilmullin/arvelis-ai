# ARVELIS AI — архитектура

**Актуальность:** Plan Real-Data Contract & AI Orchestration Policy V1, 2026-09-09.

## Принципы

- mobile-first frontend;
- `Trip` — основной продуктовый агрегат;
- UI, domain, persistence, provider adapters, auth, orchestration, audit и analytics разделены;
- server-authoritative ownership не доверяет client-supplied account identity;
- provider output считается untrusted до contract validation;
- внешние AI/travel providers заменяемы;
- demo/mock и real provider data имеют явную границу;
- секреты только в protected environment;
- legacy Chat не определяет Travel domain.

## Фактический stack

- React `19.2.8`;
- React DOM `19.2.8`;
- TypeScript `6.0.3`;
- Vite `8.2.1`;
- Node requirement `>=22.12.0 <27`; CI runtime Node `24.19.0`;
- `pg 8.23.0`;
- Nodemailer `9.1.1`;
- npm lockfile через `npm ci`;
- Vite dev: `0.0.0.0:3000`;
- same-origin `/api` proxy → trusted server runtime `127.0.0.1:3001`;
- development/closed-test persistence: SQLite;
- PostgreSQL 18.4 compatibility — PR regression gate.

## Travel frontend / persistence boundary

`src/travel/` содержит domain/UI/repository/contracts.

Persistence selection:

- preview → browser local repository;
- authenticated real mode → `HttpTripRepository` через same-origin `/api/trips`;
- server failure не переводит пользователя скрыто обратно на local persistence.

`TravelApp` не знает конкретный DB adapter.

## Server Trip boundary

`server/travel/service.ts` сохраняет server-authoritative Trip ownership/timestamps. `accountId` приходит только из authenticated session; client `ownerScopeId` не является authorization credential.

API V1:

- `GET /api/trips`;
- `GET /api/trips/:id`;
- `PUT /api/trips/:id`.

SQLite/PostgreSQL реализуют общий `ServerTripStore` contract. Migration `002_travel_trip_persistence` additive.

## Plan real-data contract

Новый `src/travel/planContracts.ts` отделяет будущий AI reasoning от raw Trip aggregate.

### `PlanRequest`

Содержит только минимальный planning snapshot:

- Trip ID + revision;
- origin / optional destination;
- dates / duration;
- traveler count;
- budget limit;
- travel preferences;
- optional bounded user prompt.

Не передаются автоматически:

- `ownerScopeId` как provider credential;
- session/cookie/auth data;
- traveler labels/identities;
- legal/map arrays;
- documents;
- provider secrets;
- database metadata.

### `PlanProposal`

Структурированный provider result содержит:

- summary;
- declared sources;
- claims;
- destination suggestions;
- itinerary suggestions;
- assumptions.

Каждый claim имеет category, provenance, confidence и source references.

Provenance V1:

- `user_input`;
- `provider_fact`;
- `model_inference`;
- `unknown`.

## Provider-neutral AI port

`AIProvider.planTrip()` больше не использует `Promise<unknown>`.

Contract:

`PlanRequest + AIPlanProviderContext + AbortSignal → Promise<PlanProposal>`.

`AIPlanProviderContext` содержит только account scope, Trip ID, locale и request ID. Конкретный vendor/model в contract не зашит.

Transport/Map/Legal/Weather/Stay/Currency interfaces этим slice не переписываются.

## Server orchestration policy

`server/travel/planOrchestrator.ts` — trusted policy layer между owned Trip и будущим AI adapter.

Последовательность:

1. проверить account scope;
2. проверить Trip ownership;
3. создать минимизированный `PlanRequest`;
4. fail closed как `not_connected`, если provider отсутствует;
5. вызвать typed provider с bounded timeout + cancellation;
6. считать provider response untrusted;
7. выполнить `validatePlanProposal`;
8. вычислить authoritative/non-authoritative claim disposition;
9. вернуть structured proposal + policy evaluation + минимальный audit metadata;
10. **не** записывать результат автоматически в Trip.

Отсутствует silent fallback на mock/local answer или другой provider.

## Provenance / authority policy

`provider_fact` обязан ссылаться на declared source. Unknown source reference делает proposal invalid.

Legal provider fact дополнительно требует official HTTPS source.

Критические external categories:

- transport schedule;
- price;
- availability;
- legal;
- weather.

Model inference для этих категорий не считается authoritative независимо от confidence. Expired provider evidence также не считается authoritative.

`user_input` — trusted только как факт того, что пользователь это сообщил; он не подтверждает внешний schedule/price/legal fact.

## Audit boundary

Plan orchestration audit содержит только:

- contract version;
- request ID;
- Trip ID/revision;
- provider ID;
- timestamps/duration;
- status;
- validation error codes.

Audit V1 не хранит prompt, proposal body, документы, cookies, session secret, API key или raw provider payload.

## Error model

Orchestration различает:

- invalid input;
- access denied;
- provider not connected;
- caller abort;
- timeout;
- provider failure;
- invalid provider response;
- invalid configuration.

Provider failure не превращается в fake success.

## CI / acceptance

Plan push gate:

- dependency audit;
- project typecheck;
- `npm run test:plan-policy`;
- Trip ownership regression;
- server runtime build;
- server-backed Chromium regression;
- frontend build.

Draft PR дополнительно сохраняет PostgreSQL 18.4 migration/persistence regression gate нижнего persistence слоя.

CI permissions остаются `contents: read`.

## Не реализовано этим slice

- real AI model/vendor;
- RAG/vector DB;
- prompt/tool execution framework;
- real transport/map/legal/weather/stay/currency adapters;
- automatic Plan → Trip mutation;
- booking/purchase;
- provider cost/rate routing across multiple vendors;
- production deploy.

Следующий roadmap layer после зелёного Plan checkpoint — provider-neutral Transport/normalized route comparison contract. Выбор реального transport provider остаётся отдельным product/engineering/legal решением.
