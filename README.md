# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider/runtime quotas и cost controls остаются backend policy.

## Closed lower checkpoint — Retrieval & Knowledge Ingestion V1

`ARVELIS Retrieval & Knowledge Ingestion Foundation V1` закрыт в Draft PR #36 на final HEAD `aab7f49c1dfc0909536e1afba7da84bcdf98be3d`.

Final PR-triggered run #721 подтвердил:

- `validate` — PASS;
- PostgreSQL 18 + pgvector `postgres-compat` — PASS;
- migration chain `001 → 002 → 003` — PASS;
- Trip PostgreSQL regression — PASS;
- Knowledge pgvector namespace/retrieval gate — PASS.

Retrieval storage остаётся PostgreSQL + pgvector; Global/private account Knowledge разделены; автоматического external ingestion и private→global promotion нет.

## Current engineering slice — Qwen Runtime Adapter & AI Evaluation V1

Branch:

`feat/travel-qwen-runtime-evaluation-v1`

Base:

`feat/travel-retrieval-knowledge-ingestion-v1` / Draft PR #36.

Цель slice — реализовать первый concrete runtime adapter **через существующий `AiModelRuntime`**, не меняя vendor-neutral policy внутри `AiGateway`.

Зафиксированный runtime target:

- model candidate: `Qwen3-8B`;
- protocol/runtime boundary: OpenAI-compatible `vLLM`;
- local development runtime может в будущем использовать `llama.cpp` через отдельный adapter;
- production runtime/GPU/weights/credentials этим slice не подключаются.

## Qwen vLLM adapter

`server/travel/runtimes/qwenVllmRuntime.ts` реализует:

`AiModelRuntime.generate(AiRuntimeInput, AbortSignal) → AiModelTurn`.

Adapter отвечает только за runtime/protocol concerns:

- validation OpenAI-compatible `/v1` endpoint;
- `POST /v1/chat/completions` mapping;
- Qwen model selector;
- structured-output JSON schema;
- OpenAI-style native tool calls;
- ARVELIS tool-ID ↔ function-name mapping;
- bounded timeout/cancellation;
- bounded response size;
- untrusted runtime-response parsing/validation.

`AiGateway` не содержит Qwen/vLLM-specific code и этим slice не изменялся.

## Endpoint/security policy

- remote vLLM endpoint — HTTPS only;
- HTTP разрешён только для loopback development (`localhost`, `127.0.0.1`, `::1`);
- credentials/query/fragment в base URL запрещены;
- optional API key может передаваться adapter configuration, но реальный key не добавлен;
- `accountScopeId` не входит в `AiRuntimeInput` и не отправляется модели.

## Structured output

Final answer запрашивается через OpenAI-compatible `response_format.type = json_schema`.

Schema соответствует существующему ARVELIS `AiStructuredAnswer`:

- contract version;
- exact request ID;
- user-facing message;
- typed claims;
- fact domain;
- `fact | inference` mode;
- evidence IDs.

После parsing adapter запускает существующую `validateAiModelTurn`. Полная evidence/protected-fact policy остаётся в `AiGateway`.

## Tool calling

Adapter-local function names:

- `trip.read` → `trip_read`;
- `transport.search` → `transport_search`;
- `map.route` → `map_route`;
- `legal.check` → `legal_check`.

Runtime может вернуть только tool, который реально присутствует в текущем `AiRuntimeInput.tools`. Unknown function name, duplicate/invalid call ID, malformed JSON arguments или unavailable tool fail closed до исполнения.

Фактическое выполнение и server-stamped provenance остаются в существующем `AiToolRegistry`.

## Qwen request mode

Adapter использует non-thinking request mode:

- `chat_template_kwargs.enable_thinking = false`;
- `temperature = 0.7`;
- `top_p = 0.8`;
- `top_k = 20`;
- bounded `max_tokens`.

Hidden reasoning не является частью ARVELIS runtime contract и не сохраняется/экспортируется этим adapter.

## Golden semantic evaluation

`server/travel/qwenGoldenEvaluation.ts` задаёт release-eval foundation для критических сценариев:

- general advice остаётся inference;
- unsupported price fails closed;
- current tool-backed price может быть authoritative;
- Knowledge-only Legal fact fails closed;
- stale protected fact fails closed;
- externally-checkable prose должно иметь structured-claim coverage.

Ключевое правило: JSON/schema success **не равен semantic success**.

Для кейсов с проверяемыми внешними утверждениями необходим отдельный explicit `semanticCoveragePassed: true`; отсутствие такого verdict закрывает evaluation fail-closed.

В текущем slice harness проверяется deterministic fixtures. Реальный Qwen3-8B ещё не запускался, поэтому live-model golden suite не считается пройденным.

## Signal-bearing verification

Основная команда:

```bash
npm run test:qwen-runtime-evaluation
```

Gate проверяет:

- endpoint/config validation;
- отсутствие account-scope leakage;
- structured-output request mapping;
- native tool-call mapping;
- malformed/unknown responses fail-closed;
- HTTP failure;
- direct cancellation;
- adapter timeout;
- unsupported protected price rejection через unchanged Gateway;
- two-round tool-backed price flow через Gateway + Tool Registry;
- golden semantic coverage fail-closed policy.

Push run #723 на implementation HEAD `d202c5632ecd923a8e0ce2e9d0f38e8214023d53` полностью PASS, включая Qwen gate, lower-layer AI/Retrieval regressions, server build, browser happy-path и frontend build.

## Closure criterion

Qwen Runtime Adapter & AI Evaluation V1 считается CLOSED только после:

1. documentation synchronization;
2. stacked Draft PR с base `feat/travel-retrieval-knowledge-ingestion-v1`;
3. PR-triggered `validate` PASS на exact final documentation HEAD;
4. PR-triggered PostgreSQL/pgvector lower-layer regression PASS на том же HEAD;
5. отсутствия production runtime/model activation.

## Explicit STOP boundary

После green Qwen Runtime/Evaluation checkpoint работа останавливается перед real model deployment.

Не входят и не разрешены этим slice:

- production GPU/runtime provisioning;
- запуск production vLLM;
- скачивание production model weights;
- real runtime/model credentials;
- paid AI APIs;
- production embedding activation;
- crawler/automatic external Knowledge ingestion;
- production deployment;
- destructive migrations;
- merge в `main`.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/07_DECISIONS.md`, `docs/52_RETRIEVAL_KNOWLEDGE_INGESTION_FOUNDATION_V1.md`, `docs/53_QWEN_RUNTIME_ADAPTER_AI_EVALUATION_V1.md`.
