# Plan Real-Data Contract & AI Orchestration Policy V1

**Дата:** 2026-09-09  
**Branch:** `feat/travel-plan-orchestration-contract-v1`  
**Base:** `feat/travel-trip-persistence-v1` / `9d147e8955e158b8684a0a9ef399415ff64358c8`  
**Draft PR:** `#29`

## 1. Цель

Зафиксировать provider-neutral contract и trusted server orchestration policy для будущего ARVELIS Plan до подключения реальной модели, RAG или travel provider.

Этот slice не пытается «сделать AI работающим любой ценой». Его задача — определить, какие данные можно отправлять будущему provider, как валидировать ответ и какие утверждения допускается считать authoritative.

## 2. Входной contract

`PlanRequest` V1 состоит из contract version, минимизированного Trip snapshot и optional bounded user prompt.

Snapshot содержит:

- Trip ID;
- Trip revision (`updatedAt`);
- origin;
- optional destination;
- optional dates;
- duration;
- traveler count;
- budget limit;
- travel preferences.

Не передаются автоматически owner/session credentials, traveler labels, legal/map arrays, документы, provider secrets или database metadata.

## 3. Результат

`PlanProposal` V1 содержит:

- `summary`;
- `sources`;
- `claims`;
- `destinationSuggestions`;
- `itinerarySuggestions`;
- `assumptions`.

Proposal является candidate output, а не автоматически подтверждённым Trip data.

## 4. Provenance model

Каждый claim обязан явно указать provenance:

- `user_input` — утверждение, полученное от пользователя;
- `provider_fact` — факт от declared external source/provider;
- `model_inference` — рассуждение/предположение модели;
- `unknown` — происхождение не подтверждено.

Confidence не заменяет provenance.

## 5. Source references

Source reference содержит:

- stable ID;
- kind `official | provider`;
- label;
- optional provider ID;
- optional HTTPS source URL;
- retrieval timestamp;
- optional validity deadline.

Unknown source references делают proposal invalid.

`provider_fact` без source invalid.

Legal `provider_fact` без official HTTPS source invalid.

## 6. Authoritative fact policy

Критические external categories:

- `transport_schedule`;
- `price`;
- `availability`;
- `legal`;
- `weather`.

Для них `model_inference` не считается authoritative даже при `confidence=high`.

Expired provider evidence также не считается authoritative.

`user_input` может быть authoritative как пользовательское constraint/statement, но не подтверждает внешний schedule/price/legal fact.

## 7. Typed AI provider port

До этого slice `AIProvider.planTrip()` возвращал `Promise<unknown>`.

V1 contract:

`planTrip(request: PlanRequest, context: AIPlanProviderContext, signal: AbortSignal): Promise<PlanProposal>`.

Context содержит:

- authenticated account scope;
- Trip ID;
- locale;
- request ID.

Vendor/model name в interface не зашит.

## 8. Server orchestrator

`PlanOrchestrator` выполняет trusted policy sequence:

1. validate account scope;
2. enforce Trip owner == authenticated account;
3. build minimized PlanRequest;
4. fail closed `not_connected`, если AI provider отсутствует;
5. invoke provider with typed context;
6. enforce timeout;
7. propagate caller cancellation;
8. validate returned proposal;
9. classify claims as authoritative/non-authoritative;
10. return proposal + policy + audit metadata.

Orchestrator не сохраняет proposal автоматически в Trip и не вызывает booking/tool actions.

## 9. Failure policy

Error codes:

- `invalid_input`;
- `access_denied`;
- `not_connected`;
- `aborted`;
- `timeout`;
- `provider_failure`;
- `invalid_provider_response`;
- `invalid_configuration`.

Нет silent success/fake fallback.

## 10. Audit policy

Audit содержит:

- version;
- request ID;
- Trip ID/revision;
- provider ID;
- start/end/duration;
- status;
- validation error codes.

Не логируются prompt, proposal body, provider raw payload, cookies, session secret, API keys или документы.

## 11. Validation limits

Contract имеет bounded text/list sizes, ID format checks, unique IDs, source/claim reference integrity и URL/date validation.

Это защищает runtime от произвольного malformed provider payload и снижает риск memory/log abuse.

## 12. Business/security smoke

`npm run test:plan-policy` проверяет:

- PlanRequest data minimization;
- prompt normalization;
- valid proposal;
- official-source requirement для legal;
- authoritative provider price/legal claims;
- non-authoritative model inference;
- expired evidence downgrade;
- account ownership fail closed;
- provider not connected;
- pre-cancelled request;
- invalid provider response;
- bounded provider timeout.

## 13. CI

Push gate:

- npm audit;
- project typecheck;
- Plan policy smoke;
- Trip ownership regression;
- server runtime build;
- server-backed Chromium regression;
- frontend build.

Stacked PR gate дополнительно запускает существующий PostgreSQL 18.4 migration/persistence regression job.

CI остаётся read-only (`contents: read`).

## 14. Non-goals

Не входят:

- real AI provider/model;
- RAG/vector DB;
- embeddings;
- tool execution;
- web/search provider;
- transport/map/legal/weather/stay/currency implementation;
- automatic Plan persistence into Trip;
- booking/ticket purchase;
- billing;
- production deploy;
- production secrets.

## 15. Definition of Done

Plan V1 готов к checkpoint, когда:

- [x] typed Plan contracts реализованы;
- [x] typed AIProvider реализован;
- [x] server orchestration policy реализована;
- [x] ownership/timeout/cancellation/error rules реализованы;
- [x] provenance/source validation реализована;
- [x] business/security smoke PASS на implementation push;
- [x] project typecheck PASS;
- [x] server build PASS;
- [x] existing Trip/browser/frontend regressions PASS;
- [x] Draft PR #29 открыт;
- [ ] final documentation-head PR regression gate PASS.

После зелёного checkpoint следующий provider-neutral layer — Transport / normalized route comparison contract. Выбор и подключение реального transport provider остаются отдельным решением.
