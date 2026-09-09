# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider quotas/cost controls остаются backend policy и не меняют `Trip`.

## Current engineering slice

`ARVELIS Retrieval & Knowledge Ingestion Foundation V1` развивается в `feat/travel-retrieval-knowledge-ingestion-v1` поверх закрытого `ARVELIS AI Engine & Knowledge Foundation V1` (Draft PR #35).

Этот slice добавляет реальную persistence/retrieval foundation для будущего RAG, но **не активирует реальную модель, embedding runtime или production Knowledge ingestion**.

Зафиксированный стек для дальнейшего AI/RAG направления:

- primary open-weight model candidate V1 — `Qwen3-8B`;
- model runtime boundary — OpenAI-compatible `vLLM`;
- local development runtime может использовать `llama.cpp` через отдельный adapter;
- embedding V1 — `Qwen3-Embedding-0.6B`;
- reranker — disabled;
- retrieval storage — существующий PostgreSQL + `pgvector`;
- отдельная vector DB не вводится;
- `AiGateway` остаётся vendor-neutral и не содержит Qwen/vLLM-specific logic.

## Retrieval / Knowledge contracts

`src/travel/knowledgeIngestionContracts.ts` задаёт:

- `global | account` namespace;
- source registry;
- document / document version / chunk contracts;
- source type, rights, status, jurisdiction и language;
- `fetchedAt`, `verifiedAt`, `effectiveFrom`, `effectiveUntil`;
- embedding lifecycle/status;
- bounded vector-search request и result contracts.

`server/travel/knowledgeEmbeddingPort.ts` оставляет embedding model заменяемым. Production embedding model не подключён; без embedding port новые chunks сохраняются с `embeddingStatus: pending`.

## Namespace isolation

Global Knowledge и private account Knowledge разделены на application и database уровнях.

- `global` namespace не содержит `accountId`;
- `account` namespace обязан иметь конкретный authenticated account ID;
- PostgreSQL primary/foreign keys включают `namespace_kind + namespace_key`;
- cross-account source/document/version/chunk linkage отклоняется БД;
- retrieval для запроса конкретного аккаунта допускает только `global + этот account`;
- private Trip, документы и переписка не продвигаются автоматически в Global Knowledge и не используются для обучения.

Global source не может быть `user`/`user_owned`; ingestion в Global Knowledge разрешён только для явно `public` или `licensed` rights.

## Ingestion / deduplication

`server/travel/knowledgeIngestionService.ts`:

- нормализует текст (`NFC`, LF, trim);
- вычисляет SHA-256 content hash;
- deduplicate выполняется внутри `(namespace, document, content_hash)`;
- duplicate version в другом account namespace не считается тем же документом;
- concurrent duplicate insert обрабатывается fail-safe через PostgreSQL uniqueness + повторный lookup;
- malformed metadata, rights, namespace, timestamps и embedding batch отклоняются до trusted use.

Автоматического crawler/import pipeline нет. Реальные внешние источники этим slice не скачиваются и не индексируются.

## PostgreSQL + pgvector

Additive migration:

`server/db/migrations/003_knowledge_retrieval_foundation.sql`

Она:

- выполняет `CREATE EXTENSION IF NOT EXISTS vector`;
- не изменяет `001_auth_foundation.sql` и `002_travel_trip_persistence.sql`;
- создаёт `knowledge_sources`, `knowledge_documents`, `knowledge_document_versions`, `knowledge_chunks`;
- хранит embedding как `vector(1024)`;
- хранит source/version status, rights, jurisdiction/language и freshness timestamps;
- сохраняет namespace isolation в composite PK/FK;
- не создаёт approximate vector index до появления реальных объёмов и измерений производительности.

V1 repository использует bounded exact cosine search через pgvector. Максимальный пользовательский retrieval result — 20 элементов; текущий Gateway retriever запрашивает не более 12.

## Retrieval policy

`server/travel/postgresKnowledgeRetriever.ts` адаптирует PostgreSQL repository к уже существующему `KnowledgeRetriever`.

Default AI retrieval:

- namespaces: `global + authenticated account`;
- source status: `active`;
- version status: `ready`;
- locale `ru-RU`: `ru-RU | ru`;
- freshness: `current_or_unknown`;
- bounded result count;
- repository output повторно нормализуется и проходит существующую `KnowledgeRetrievalResult` validation до попадания в `AiGateway`.

Freshness semantics:

- `effectiveUntil >= asOf` => current;
- отсутствующий `effectiveUntil` => unknown;
- expired version исключается при `current`/`current_or_unknown` согласно filter policy;
- retrieval/fetched time сам по себе не означает юридическую или provider freshness.

RAG по-прежнему не обходится вокруг protected-fact policies: Legal/Transport/Map authoritative facts требуют соответствующий validated tool evidence.

## Provider-neutral AI Gateway

Existing `server/travel/aiGateway.ts` не получил Qwen/vLLM-specific logic.

Gateway:

- хранит authenticated account scope server-side;
- передаёт model runtime только normalized input;
- валидирует retriever/model/tool output;
- поддерживает timeout/cancellation;
- ограничивает tool/evidence rounds;
- возвращает truthful `not_connected`, если runtime отсутствует.

## Verification

Signal-bearing gates:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:ai-knowledge-foundation
npm run test:retrieval-knowledge-foundation
npm run test:transport-provider-foundation
npm run test:yandex-rasp-live
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

PR-triggered PostgreSQL/pgvector gate дополнительно выполняет:

```bash
npm run db:migrate
npm run test:trip-postgres
npm run test:knowledge-postgres-foundation
```

PostgreSQL CI image: `pgvector/pgvector:0.8.6-pg18`.

## Scope boundaries

Retrieval/Knowledge Ingestion V1 **не включает**:

- crawler или автоматическое скачивание внешних источников;
- production source set;
- production embedding activation;
- Qwen/vLLM runtime activation;
- production GPU/model weights;
- credentials или paid API;
- reranker;
- отдельную vector DB;
- automatic Trip/chat/document → Global Knowledge ingestion;
- training/fine-tuning на пользовательских данных;
- production deployment;
- merge в `main`;
- destructive migrations.

После полного green Retrieval checkpoint следующий утверждённый slice — `Qwen Runtime Adapter & AI Evaluation V1`. Реальный GPU/runtime deployment остаётся отдельным STOP boundary.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/07_DECISIONS.md`, `docs/52_RETRIEVAL_KNOWLEDGE_INGESTION_FOUNDATION_V1.md`.
