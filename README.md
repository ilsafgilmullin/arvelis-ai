# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider quotas/cost controls остаются backend policy и не меняют `Trip`.

## Current engineering slice

`ARVELIS AI Engine & Knowledge Foundation V1` развивается в `feat/travel-ai-knowledge-foundation-v1` поверх закрытого `Legal Sources & Travel Legal Foundation V1` (Draft PR #34).

**Реальная модель, embedding provider, vector database, RAG storage, production knowledge ingestion и AI credentials не подключены.** Активный пользовательский AI runtime остаётся truthful `not_connected`.

## Provider-neutral AI Gateway

`server/travel/aiGateway.ts` отделяет application policy от конкретного model/runtime vendor.

Gateway:

- принимает bounded structured request;
- хранит authenticated account scope только server-side;
- передаёт model runtime только prompt/locale/scope, уже-authorized Trip ID, evidence и список реально подключённых tools;
- поддерживает global timeout/cancellation;
- ограничивает tool-call rounds и evidence budget;
- валидирует retrieval output, model turns, tool calls, tool evidence и final structured answer;
- возвращает truthful `not_connected`, если runtime отсутствует;
- не логирует prompt, raw evidence, provider response bodies или secrets в orchestration audit.

Existing `PlanOrchestrator` не заменён: он остаётся отдельным high-level planning contract. Generic AI Gateway — новый нижний execution/evidence boundary для будущего runtime.

## Runtime / retrieval ports

`server/travel/aiEnginePorts.ts` задаёт injected interfaces:

- `AiModelRuntime`;
- `KnowledgeRetriever`;
- AI tool handlers.

Ни один concrete vendor adapter в V1 не выбран.

Knowledge/RAG boundary нормализует `KnowledgeSource`, `KnowledgeChunk` и retrieval result. Retriever output считается untrusted и проходит deterministic validation до попадания в model context.

## Tool registry

Allowlisted tool IDs:

- `trip.read`;
- `transport.search`;
- `map.route`;
- `legal.check`.

Model видит только фактически зарегистрированные handlers. Произвольный tool ID отклоняется. Evidence после tool execution получает server-stamped `origin: tool` и реальный `toolId`; модель не может самостоятельно объявить provider/tool provenance.

## Protected facts

Модель **не является источником фактов** для:

- цен;
- расписаний транспорта;
- availability;
- route-map geometry/facts;
- legal requirements;
- weather.

Price/schedule/availability требуют current evidence от `transport.search`. Map facts — от `map.route`. Legal facts — current official HTTPS evidence от `legal.check`. Weather в Foundation V1 не имеет authoritative tool, поэтому weather fact не может стать authoritative вообще.

Knowledge/RAG evidence само по себе не может сделать protected fact authoritative, даже если retrieved source помечен official. Например Legal fact обязан пройти normalized Legal tool boundary.

## Structured output / provenance

Model answer содержит явные structured claims:

- domain;
- `fact | inference`;
- evidence IDs.

Inference всегда non-authoritative. Fact без evidence отклоняется. Protected fact без matching current tool evidence отклоняется целиком как invalid model output.

Free-form `message` является presentation text, а не доказательством factual authority. Перед подключением real runtime обязательна semantic evaluation, что externally-checkable assertions из prose также представлены в structured claims; deterministic schema alone этого доказать не может.

## Evaluation policy

`server/travel/aiEvaluationPolicy.ts` задаёт mandatory release-eval checklist. Real runtime adapter нельзя активировать, пока critical cases не имеют явного PASS: not-connected behavior, account-scope isolation, unknown tools, unsupported protected facts, official Legal evidence, stale evidence, retrieval validation, cancellation/timeout и structured-claim coverage prose.

## Verification

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:ai-knowledge-foundation
npm run test:transport-provider-foundation
npm run test:yandex-rasp-live
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

Новый AI test — один signal-bearing business/security/evidence gate; отдельный browser suite не добавлен, потому что этот foundation slice не выполняет active AI UI/runtime wiring.

## STOP boundary

После green AI/Knowledge Foundation checkpoint **не выбирать и не активировать самостоятельно**:

- model/runtime vendor;
- embedding provider;
- vector DB;
- production knowledge source set/ingestion pipeline;
- AI production credentials;
- paid AI/RAG services.

Также не выполнять production deployment или merge в `main` без отдельного подтверждения.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/51_ARVELIS_AI_ENGINE_KNOWLEDGE_FOUNDATION_V1.md`.
