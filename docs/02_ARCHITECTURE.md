# ARVELIS AI — архитектура

**Актуальность:** ARVELIS AI Engine & Knowledge Foundation V1, 2026-09-09.

## Core invariants

- `Trip` remains the core product aggregate;
- UI, domain, persistence, orchestration, tools and external-provider adapters are separate layers;
- authenticated server session is authoritative for ownership;
- external/provider/model/retrieval output is untrusted until deterministic validation;
- external facts require provenance and freshness;
- provider/model-specific IDs, terms, quotas and credentials do not enter `Trip`;
- secrets stay server-side;
- no mock/fake data is presented as real provider output;
- model inference is never promoted to an authoritative protected external fact by itself.

## Closed lower layers

- Travel UI V2;
- Server-side Trip Persistence & API V1;
- Plan Real-Data Contract & AI Orchestration Policy V1;
- Transport Normalized Route Contract V1;
- Transport Provider Strategy & Adapter Foundation V1;
- Yandex Rasp Live Adapter V1 — implementation closed, production key not activated;
- Map Provider Foundation & Route Map V1 — Draft PR #33, green, no real map provider;
- Legal Sources & Travel Legal Foundation V1 — Draft PR #34, green, no real Legal provider.

## ARVELIS AI Engine & Knowledge Foundation V1

### Architectural position

The foundation adds a generic AI/Knowledge execution layer next to the already closed `PlanOrchestrator`; it does not replace Plan V1 and does not connect a real model.

Main files:

- `src/travel/aiKnowledgeContracts.ts` — normalized Knowledge, evidence, tool-call and structured-answer contracts;
- `server/travel/aiEnginePorts.ts` — provider-neutral model-runtime, retriever and tool-handler ports;
- `server/travel/aiToolRegistry.ts` — allowlisted tool registry;
- `server/travel/aiGateway.ts` — bounded server orchestration loop;
- `server/travel/aiEvaluationPolicy.ts` — release/evaluation policy.

No model/runtime provider, embedding provider, vector DB or production ingestion pipeline is selected by this layer.

### Gateway request/context boundary

`AiGatewayRequest` contains only:

- contract version;
- prompt;
- `ru-RU` locale;
- `general | trip` scope.

Server-only execution context contains the authenticated account scope and, for trip-scoped requests, an already-authorized Trip ID.

`accountScopeId` is intentionally not exposed in model-runtime input. A trip-scoped Gateway request without an authorized Trip ID fails before runtime execution.

### Model/runtime adapter boundary

`AiModelRuntime` is a provider-neutral port. A future adapter receives only normalized runtime input and an `AbortSignal`.

The runtime can return only a validated structured turn:

- `tool_calls`; or
- final structured `answer`.

The Gateway does not assume a vendor-specific SDK, prompt format, model name, token API or credential shape.

### Knowledge / RAG boundary

`KnowledgeRetriever` returns normalized `KnowledgeRetrievalResult` with bounded sources and chunks.

Knowledge sources carry:

- stable source ID;
- title/publisher;
- `official | editorial | user` type;
- optional HTTPS URL;
- retrieval timestamp;
- optional provider/source validity.

Chunks reference an existing source, carry a fact domain and bounded relevance score. Retriever output is validated before it can become model evidence.

Retrieval time is not source validity. Missing `validUntil` becomes freshness `unknown`; expired evidence is never treated as current.

RAG/Knowledge evidence cannot bypass tool-specific authority rules for protected domains.

### Tool registry

The V1 allowlist contains only:

- `trip.read`;
- `transport.search`;
- `map.route`;
- `legal.check`.

The model sees only handlers actually registered in the server-side registry. Unknown tool IDs fail validation.

Tool handlers receive server context; their normalized evidence is server-stamped with the actual executed `toolId`. The model cannot manufacture tool provenance by declaring a tool ID inside its answer.

No Weather tool is connected in V1.

### Protected external facts

Protected domains are:

- transport schedule;
- price;
- availability;
- map route;
- legal;
- weather.

Authority rules are deterministic:

- schedule/price/availability require current evidence from `transport.search`;
- map route requires current evidence from `map.route`;
- legal requires current official HTTPS evidence from `legal.check`;
- weather is non-authoritative in V1 because no approved Weather tool exists;
- model inference is never authoritative for these domains.

An official RAG document alone does not make a Legal claim authoritative. Legal authority remains behind the validated Legal tool/source boundary.

### Structured output validation

Final output contains a user-visible message plus typed claims. Each claim declares:

- fact domain;
- `fact | inference` mode;
- evidence references.

A protected `fact` without the correct current tool evidence fails closed as invalid model output. Unknown/stale/wrong-tool evidence cannot elevate a claim.

The schema validates declared claims and evidence references. It cannot semantically prove that a free-form message contains no undeclared factual assertion. Therefore a future real-model release must include semantic evaluation ensuring externally-checkable assertions are represented in structured claims before activation.

### AiGateway orchestration

`AiGateway` provides:

1. request/context validation;
2. truthful `not_connected` when no runtime is configured;
3. optional validated retrieval;
4. allowlisted tool exposure;
5. bounded tool loop — maximum two tool rounds;
6. bounded evidence budget;
7. global timeout and caller cancellation;
8. structured turn/output validation;
9. deterministic claim authority evaluation;
10. sanitized audit metadata.

Prompt text, raw evidence payloads, provider credentials and source documents are not written into audit metadata by this layer.

### Runtime activation state

The foundation code is compiled and tested, but it is not wired into the active user-facing runtime. Existing UI truthfulness remains unchanged: no real AI answer is presented while no runtime is configured.

## Evaluation / release policy

A real runtime cannot be activated merely because a provider call works.

The release gate must cover at least:

- account-scope isolation;
- trip authorization boundary;
- unknown/unregistered tools;
- unsupported price/schedule/availability/map/legal/weather facts;
- stale evidence;
- malformed retrieval/model/tool output;
- timeout/cancellation;
- tool provenance stamping;
- protected-fact enforcement;
- semantic coverage of externally-checkable assertions in structured claims.

The current foundation smoke verifies the deterministic critical subset; semantic model evaluation remains a mandatory future activation gate.

## CI / testing

Signal-bearing gates for this slice:

- dependency audit;
- strict project typecheck;
- existing Plan/Transport/Map/Legal/Yandex/Trip regressions;
- one `test:ai-knowledge-foundation` business/security/evidence gate;
- server runtime build including Gateway/Knowledge files;
- existing server-backed Chromium happy-path;
- frontend build;
- PostgreSQL lower-layer regression in the stacked PR.

CI keeps `contents: read`.

## STOP boundary

After this foundation closes, implementation stops before choosing or activating:

- a real model/runtime provider;
- an embedding provider;
- a vector database/retrieval engine;
- a production knowledge source set and ingestion policy;
- AI credentials or production AI wiring.

Those choices require a separate product/technical decision. No merge to `main`, production deploy, paid service or destructive migration is part of this foundation.
