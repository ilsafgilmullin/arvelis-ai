# ARVELIS AI Engine & Knowledge Foundation V1

**Дата:** 2026-09-09  
**Ветка:** `feat/travel-ai-knowledge-foundation-v1`  
**Base:** `feat/travel-legal-sources-foundation-v1` / `54f5d7b14bd12ec0d9da9c92eede79598664dbf7`  
**Implementation checkpoint:** `0fe64c86a224cfe3860a37b1ff7064b909670237`

## 1. Цель

Создать provider-neutral foundation для будущего ARVELIS AI без подключения реальной модели, embeddings, vector DB, production RAG ingestion или AI credentials.

Foundation должен заранее отделить:

- model/runtime execution;
- retrieval/RAG;
- trusted Travel tools;
- structured output;
- provenance/freshness;
- authorization context;
- evaluation/release policy.

Главное правило: модель может рассуждать и формулировать ответ, но не является источником истины для внешних динамических фактов.

## 2. Non-goals

В этом slice НЕ выполняются:

- выбор OpenAI/Anthropic/Yandex/GigaChat/другого runtime;
- выбор конкретной модели;
- API credentials;
- embeddings;
- vector DB;
- crawler/source ingestion;
- production RAG;
- production AI UI/backend activation;
- paid service activation;
- merge в `main`;
- production deployment.

## 3. Provider-neutral contracts

`src/travel/aiKnowledgeContracts.ts` определяет:

- `AiGatewayRequest`;
- `KnowledgeSource`;
- `KnowledgeChunk`;
- `KnowledgeRetrievalResult`;
- normalized `AiEvidence`;
- `AiToolDescriptor` / `AiToolCall`;
- `AiStructuredClaim`;
- `AiStructuredAnswer`;
- `AiModelTurn`;
- `AiClaimEvaluation`;
- deterministic validation errors/policy.

Контракты не содержат vendor model IDs, API-key shape, token accounting или SDK-specific objects.

## 4. Model/runtime boundary

`server/travel/aiEnginePorts.ts` определяет `AiModelRuntime`.

Runtime получает только нормализованный model-visible input и `AbortSignal`.

Server-only `accountScopeId` не входит в model input.

Для trip-scoped AI server context обязан содержать уже авторизованный Trip ID. Foundation не перекладывает ownership decision на модель.

При `runtime: null` Gateway возвращает truthful `not_connected`.

## 5. Knowledge / RAG boundary

`KnowledgeRetriever` является отдельным injected port.

Retriever получает server execution context, но возвращает только normalized bounded source/chunk contract.

Перед использованием проверяются:

- version/query identity;
- source/chunk limits;
- unique IDs;
- chunk → source references;
- HTTPS source URLs;
- timestamps;
- fact domains;
- relevance bounds.

`retrievedAt` не считается сроком действия факта.

Если `validUntil` отсутствует, freshness = `unknown`. Если срок истёк — `expired`.

## 6. Tool registry

`server/travel/aiToolRegistry.ts` содержит allowlisted V1 catalog:

1. `trip.read`;
2. `transport.search`;
3. `map.route`;
4. `legal.check`.

Модель видит только реально зарегистрированные handlers.

Unknown tool call fail-closed.

Handler получает server context. После выполнения evidence server-stamped реальным `toolId`; модель не может самостоятельно присвоить evidence ложный tool provenance.

Foundation не подключает эти tools автоматически к production runtime. Registry остаётся injection boundary.

## 7. Protected fact policy

Protected fact domains:

- `transport_schedule`;
- `price`;
- `availability`;
- `map_route`;
- `legal`;
- `weather`.

Authority requirements:

| Domain | Authoritative evidence requirement |
| --- | --- |
| transport schedule | current `transport.search` evidence |
| price | current `transport.search` evidence |
| availability | current `transport.search` evidence |
| map route | current `map.route` evidence |
| legal | current official HTTPS `legal.check` evidence |
| weather | unavailable as authoritative in V1 |

Model inference alone is non-authoritative.

Knowledge/RAG cannot bypass the required Travel tool for protected domains.

Особенно: даже official Legal document из RAG не превращает Legal claim в authoritative; Legal fact должен пройти Legal tool/source contract.

## 8. Structured model output

Runtime может вернуть:

- bounded `tool_calls`; или
- structured answer.

Final answer содержит:

- display `message`;
- typed `claims`.

Каждый claim указывает domain, `fact | inference` и evidence IDs.

Protected `fact` без правильного current tool evidence отклоняется как `invalid_model_output`.

Stale/unknown/wrong-tool evidence не повышает authority.

## 9. Free-form message limitation

Deterministic schema validation контролирует declared structured claims.

Она не может семантически доказать, что в свободном `message` отсутствует новый externally-checkable fact, который модель не вынесла в claims.

Поэтому перед реальной model activation обязательна semantic evaluation policy:

> Все внешне проверяемые утверждения в пользовательском ответе должны быть представлены structured claims и пройти provenance/evidence validation.

Без этого activation gate реальный runtime не должен быть включён.

## 10. AiGateway

`server/travel/aiGateway.ts` реализует bounded orchestration:

1. request/context validation;
2. truthful `not_connected`;
3. optional Knowledge retrieval;
4. retrieval validation → evidence;
5. connected-tool allowlist exposure;
6. model turn validation;
7. server-side tool execution;
8. server-stamped tool evidence;
9. максимум два tool rounds;
10. evidence budget;
11. final structured answer validation;
12. deterministic authority evaluation;
13. timeout/cancellation;
14. sanitized audit.

Gateway не записывает prompt/evidence text в audit metadata.

## 11. Evaluation policy

`server/travel/aiEvaluationPolicy.ts` задаёт critical release-eval IDs и fail-closed release gate.

Foundation smoke подтверждает, что incomplete/failed critical evaluation set не может считаться release-ready.

Перед реальным runtime mandatory evaluation должна включать минимум:

- account scope isolation;
- trip authorization;
- unknown tools;
- unsupported price/schedule/availability/map/legal/weather facts;
- stale evidence;
- malformed retriever/tool/model output;
- provenance stamping;
- timeout/cancellation;
- structured-claim semantic coverage.

## 12. Security properties

- account scope остаётся server-only;
- model output untrusted;
- retrieval output untrusted;
- tool output untrusted до normalization;
- unknown tools rejected;
- protected facts require the correct tool;
- stale evidence rejected for authority;
- no model/provider secrets in Trip;
- no raw prompt/evidence in Gateway audit;
- bounded request/output/tool/evidence execution;
- caller cancellation and global timeout.

## 13. Persistence

Foundation не добавляет:

- conversation DB;
- vector storage;
- embedding storage;
- model cache persistence;
- production Knowledge index.

Любая будущая persistence/retention требует отдельного решения по privacy, source rights, refresh, deletion и audit.

## 14. Verification

Implementation push #704 на `0fe64c86a224cfe3860a37b1ff7064b909670237` фактически прошёл:

- dependency audit;
- strict typecheck;
- Plan regression;
- Transport regression;
- Map/Legal foundation regression;
- AI/Knowledge business/security/evidence gate;
- Yandex Rasp regression;
- Trip ownership regression;
- server runtime build;
- existing server-backed Chromium happy-path;
- frontend build.

Финальное закрытие slice требует stacked Draft PR на Legal V1 и PR-triggered `validate + postgres-compat` на final documentation SHA.

## 15. STOP / decisions required next

После зелёного final PR checkpoint дальнейшая реализация останавливается.

Отдельного продуктово-технического решения требуют:

1. real model/runtime provider;
2. конкретная model family/tier;
3. primary/fallback runtime policy;
4. embedding provider/model;
5. vector database/retrieval engine;
6. production Knowledge source set;
7. ingestion/update/freshness pipeline;
8. retention/deletion/privacy/source-rights policy;
9. semantic evaluation methodology and thresholds;
10. Weather tool/provider strategy;
11. credentials/quota/cost controls;
12. production activation sequence.

До утверждения этих решений AI Gateway Foundation остаётся архитектурой и проверенным server boundary, но не реально подключённым AI-сервисом.
