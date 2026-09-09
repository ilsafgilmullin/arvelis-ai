# ARVELIS AI — архитектура

**Актуальность:** Qwen Runtime Adapter & AI Evaluation V1, 2026-09-10.

## Core invariants

- `Trip` remains the core product aggregate;
- UI, domain, persistence, retrieval, orchestration, model runtime and provider adapters are separate layers;
- authenticated server session is authoritative for ownership;
- external/provider/retriever/model output is untrusted until deterministic validation;
- external facts require provenance/freshness and protected facts require matching normalized tool evidence;
- secrets stay server-side;
- private account Knowledge never becomes Global Knowledge implicitly;
- user Trips/documents/conversations are not training data by default;
- runtime-vendor details do not enter `AiGateway`.

## Closed lower layers

- Travel UI V2;
- Server-side Trip Persistence & API V1;
- Plan Real-Data Contract & AI Orchestration Policy V1;
- Transport Normalized Route Contract V1;
- Transport Provider Strategy & Adapter Foundation V1;
- Yandex Rasp Live Adapter V1 — production key not activated;
- Map Provider Foundation & Route Map V1 — Draft PR #33;
- Legal Sources & Travel Legal Foundation V1 — Draft PR #34;
- ARVELIS AI Engine & Knowledge Foundation V1 — Draft PR #35;
- Retrieval & Knowledge Ingestion Foundation V1 — Draft PR #36, final HEAD `aab7f49c1dfc0909536e1afba7da84bcdf98be3d`, PR run #721 green including PostgreSQL 18 + pgvector.

## AI/RAG stack direction

Approved direction remains:

- model candidate V1: `Qwen3-8B`;
- runtime protocol: OpenAI-compatible `vLLM`;
- optional local development runtime boundary: `llama.cpp`;
- embedding V1 target: `Qwen3-Embedding-0.6B`;
- reranker disabled;
- retrieval storage: PostgreSQL + pgvector;
- no separate vector DB.

This is not production deployment approval.

## Provider-neutral AI Engine

`server/travel/aiGateway.ts` remains the policy/orchestration boundary.

`AiGateway` owns:

- request/context validation;
- account/trip authorization boundary;
- optional Knowledge retrieval;
- allowlisted tool exposure/execution;
- bounded tool/evidence rounds;
- protected-fact policy;
- structured answer/evidence validation;
- global timeout/cancellation;
- sanitized audit metadata.

Model-specific request format, model name, endpoint, API authentication and tool-call parser behavior do not belong in the Gateway.

`server/travel/aiEnginePorts.ts` keeps `AiModelRuntime` as the replaceable interface:

`generate(AiRuntimeInput, AbortSignal) → Promise<AiModelTurn>`.

`AiRuntimeInput` deliberately excludes server `accountScopeId`.

## Retrieval layer

The closed Retrieval V1 remains underneath the runtime:

- PostgreSQL + pgvector;
- additive migration `003_knowledge_retrieval_foundation.sql`;
- explicit `global | account` namespaces;
- composite namespace PK/FK isolation;
- SHA-256 normalized-content deduplication;
- Global rights gate;
- bounded freshness/language/jurisdiction/status filters;
- provider-neutral embedding port;
- existing `KnowledgeRetriever` adapter.

No crawler or production embedding activation exists.

## Qwen Runtime Adapter & AI Evaluation V1

### Architectural position

Concrete runtime path:

`AiGateway → AiModelRuntime → QwenVllmRuntime → OpenAI-compatible vLLM /v1/chat/completions`.

Main files:

- `server/travel/runtimes/qwenVllmRuntime.ts` — concrete Qwen/vLLM protocol adapter;
- `server/travel/qwenGoldenEvaluation.ts` — golden semantic release-evaluation foundation;
- `tests/qwen-runtime-evaluation-smoke.ts` — signal-bearing adapter/Gateway/evaluation regression gate;
- `docs/53_QWEN_RUNTIME_ADAPTER_AI_EVALUATION_V1.md` — detailed checkpoint.

`AiGateway` itself is unchanged by this slice.

### Endpoint/configuration boundary

`QwenVllmRuntime` accepts a base URL pointing to OpenAI-compatible `/v1`.

Rules:

- remote endpoint must be HTTPS;
- HTTP is permitted only for loopback development;
- base URL must not carry username/password/query/fragment;
- model ID is bounded/validated;
- optional API key is constructor/runtime configuration only and is not hard-coded;
- no real endpoint/key is configured by this slice.

Default model selector is `Qwen/Qwen3-8B`, but no weight is downloaded or executed.

### Request mapping

The adapter maps normalized `AiRuntimeInput` into Chat Completions messages.

Model-visible runtime context includes:

- request ID;
- locale;
- general/trip scope;
- already-authorized Trip ID when applicable;
- normalized evidence;
- only tools currently exposed by the Gateway;
- user prompt.

It does not include `accountScopeId`.

Retrieved/tool evidence is explicitly described as untrusted data rather than instructions to reduce prompt-injection authority confusion. Gateway validation remains authoritative even if the model ignores that instruction.

### Structured output mapping

Final answers request `response_format.type = json_schema` with a strict schema mirroring `AiStructuredAnswer`:

- version 1;
- exact request ID;
- bounded message;
- bounded typed claims;
- fact domain;
- `fact | inference`;
- evidence IDs.

Adapter parsing runs `validateAiModelTurn` before returning the normalized turn.

This is only protocol/schema validation. The Gateway later performs full evidence-reference and protected-fact validation.

### Tool-call mapping

Adapter-local function names map existing provider-neutral tool IDs:

- `trip.read` ↔ `trip_read`;
- `transport.search` ↔ `transport_search`;
- `map.route` ↔ `map_route`;
- `legal.check` ↔ `legal_check`.

The model may request only a tool present in current `AiRuntimeInput.tools`.

Rejected fail-closed:

- unknown function;
- unavailable tool;
- invalid/duplicate call ID;
- non-function call;
- oversized/malformed arguments;
- JSON arguments that are not an object.

`AiToolRegistry` remains responsible for actual execution, input/output boundary and server-stamped provenance.

The current generic `AiToolDescriptor` does not expose provider-neutral JSON input schemas. Therefore the adapter sends a generic object parameter schema rather than inventing Qwen-only schemas. A future typed tool-schema extension, if required, must be added to the provider-neutral contract.

### Qwen request mode

Qwen3 adapter uses non-thinking mode:

- `chat_template_kwargs.enable_thinking=false`;
- temperature `0.7`;
- top_p `0.8`;
- top_k `20`;
- bounded max tokens.

Hidden reasoning is not part of `AiModelTurn` and is not stored/exposed by ARVELIS.

### Cancellation / timeout / HTTP boundary

Adapter:

- accepts caller `AbortSignal`;
- forwards cancellation to HTTP;
- applies independent bounded adapter timeout (default 25s, max 120s);
- rejects non-2xx responses;
- rejects malformed JSON/choice/message response shapes;
- bounds response size;
- returns normalized runtime-specific errors.

The Gateway retains its independent overall timeout/cancellation boundary.

### Golden semantic evaluation

`server/travel/qwenGoldenEvaluation.ts` separates structural validation from semantic release evaluation.

Critical cases include:

- general advice remains inference;
- unsupported price fails closed;
- tool-backed current price may be authoritative;
- Knowledge-only Legal fact fails closed;
- stale protected fact fails closed;
- externally-checkable prose has structured claim coverage.

For cases requiring semantic coverage, a result does not pass unless `semanticCoveragePassed === true` is supplied explicitly.

This prevents JSON-schema success from masquerading as semantic safety.

Current deterministic fixtures prove the harness behavior and adapter/Gateway integration. They do **not** prove a live Qwen3-8B model passes the semantic suite, because no live model is deployed in this slice.

Before real deployment the same golden harness must be executed against the real candidate runtime under an approved semantic evaluation process.

## Verification state

Initial push run #722 exposed a strict TypeScript `exactOptionalPropertyTypes` issue in the adapter's optional API-key field. The fix made the internal field explicitly `string | undefined`; behavior/security policy did not change.

Push run #723 on implementation HEAD `d202c5632ecd923a8e0ce2e9d0f38e8214023d53` passed:

- dependency audit;
- typecheck;
- Plan/Transport/Map/Legal regressions;
- AI Engine gate;
- Retrieval gate;
- Qwen Runtime/Evaluation gate;
- Yandex/Trip regressions;
- server runtime build;
- server-backed Chromium happy-path;
- frontend build.

Final Qwen closure additionally requires stacked PR-triggered CI on exact documentation HEAD; PostgreSQL/pgvector lower-layer regression remains mandatory.

## Real deployment STOP boundary

After Qwen Runtime Adapter & AI Evaluation V1 closes, stop before:

- GPU/runtime provisioning;
- real vLLM server activation;
- model weight download/placement;
- production endpoint/credentials;
- paid AI API;
- production embedding activation;
- automatic external Knowledge ingestion;
- production deployment;
- destructive migrations;
- merge to `main`.

Real model deployment requires a separate explicit decision and a live-model golden evaluation.
