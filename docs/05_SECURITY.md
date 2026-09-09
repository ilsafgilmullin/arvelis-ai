# ARVELIS AI — безопасность

**Актуальность:** Qwen Runtime Adapter & AI Evaluation V1 / бесплатная user-facing модель, 2026-09-10.

## Global invariants

- Account/Session and Trip ownership are server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider/model secrets are server-side only;
- external provider, retriever, tool and model output is untrusted input;
- provider/model credentials and IDs do not enter `Trip`;
- raw prompt/evidence/model response/secrets are not operational audit payloads by default;
- billing/subscriptions/paywall remain outside Travel Domain;
- private account Knowledge and Global Knowledge remain isolated;
- user Trips/documents/conversations are not training data by default;
- model inference never becomes an authoritative protected fact without the required current evidence/tool boundary.

## AiGateway remains the security/policy boundary

`AiGateway` is unchanged by the Qwen slice and remains vendor-neutral.

It owns:

- request/context validation;
- authenticated account/trip boundary;
- optional retrieval;
- allowlisted tools;
- bounded tool/evidence rounds;
- model-turn validation;
- protected-fact evidence enforcement;
- global cancellation/timeout;
- sanitized audit metadata.

`accountScopeId` exists only in server context and is deliberately absent from `AiRuntimeInput`; therefore the Qwen adapter cannot serialize it unless the provider-neutral contract itself is changed.

## Closed Retrieval/Knowledge security boundary

Retrieval V1 remains in force:

- explicit `global` and account namespaces;
- composite PostgreSQL namespace PK/FKs;
- Global Knowledge only with explicit `public|licensed` rights;
- account Knowledge cannot be queried as another account;
- SHA-256 dedup remains namespace-scoped;
- no private→global implicit promotion;
- no automatic Trip/chat/document ingestion;
- no training/fine-tuning on user content;
- PostgreSQL 18 + pgvector regression remains mandatory.

## Qwen/vLLM endpoint boundary

`QwenVllmRuntime` validates runtime configuration before network execution.

Rules:

- remote base URL must use HTTPS;
- plain HTTP is accepted only for loopback development hosts;
- URL-embedded username/password is forbidden;
- query/fragment in base URL is forbidden;
- base path must be OpenAI-compatible `/v1`;
- model identifier is bounded;
- optional API key is runtime configuration only, never embedded in code/docs/tests;
- no production endpoint/key exists in this slice.

The adapter follows redirects with `redirect: error` rather than silently following an unexpected redirect target.

## Runtime data minimization

Model request contains only normalized `AiRuntimeInput` information needed for execution:

- request ID;
- locale/scope;
- authorized Trip ID when applicable;
- bounded evidence;
- exposed tool descriptors;
- user prompt.

It does not contain authenticated `accountScopeId`, session cookies, OTP data, database credentials or provider secrets.

Fixture tests explicitly assert absence of `accountScopeId` in the serialized vLLM payload.

## Prompt-injection / evidence boundary

Runtime context labels retrieved/tool evidence as untrusted data, not instructions.

This instruction is defense-in-depth only. Security does not depend on model obedience:

- model tool calls are parsed against the server-provided allowlist;
- unknown/unavailable tools fail closed;
- tool execution occurs through `AiToolRegistry`;
- tool provenance is server-stamped;
- final protected facts are revalidated by `AiGateway` against actual evidence.

An injected Knowledge chunk cannot grant itself tool authority or bypass Legal/Transport/Map requirements.

## Structured-output boundary

The adapter requests strict JSON-schema output for `AiStructuredAnswer` and then parses it as untrusted data.

Fail-closed cases include:

- missing/extra Chat Completion choice shape;
- non-assistant result;
- invalid JSON answer;
- wrong request ID/version/shape through existing `validateAiModelTurn`;
- malformed or unavailable tool call;
- malformed tool arguments.

Schema validity alone does not prove factual correctness. Gateway policy remains authoritative after adapter normalization.

## Tool-call security

Adapter-local runtime function names are mapped to fixed provider-neutral IDs:

- `trip_read` → `trip.read`;
- `transport_search` → `transport.search`;
- `map_route` → `map.route`;
- `legal_check` → `legal.check`.

A tool call is accepted only when:

- type is `function`;
- call ID is bounded/valid/unique;
- runtime function name maps to a known ARVELIS tool;
- the mapped tool is actually exposed in the current request;
- arguments are bounded valid JSON object data.

The adapter cannot dynamically construct arbitrary server function names.

The current generic tool parameter schema is not treated as authorization. `AiToolRegistry` and each normalized provider/orchestrator remain responsible for authoritative input validation and access control.

## Qwen reasoning/output policy

The adapter requests Qwen non-thinking mode via `chat_template_kwargs.enable_thinking=false`.

Hidden chain-of-thought/reasoning is not part of `AiModelTurn`, is not required for correctness and is not persisted/exposed by this runtime boundary.

Final result must be presentation text + structured claims/evidence references only.

## Cancellation / timeout / denial-of-service controls

Adapter controls:

- caller `AbortSignal` propagation;
- independent default runtime timeout 25 seconds;
- maximum configured runtime timeout 120 seconds;
- bounded `max_tokens`;
- bounded tool-call count inherited from `AiModelTurn` validation;
- bounded tool-argument JSON;
- bounded response body;
- non-2xx rejection.

The Gateway independently maintains its overall timeout, evidence budget and tool-round bounds. Adapter timeout therefore does not replace the application-level execution budget.

## Runtime response trust

vLLM/model output remains untrusted even from a self-hosted endpoint.

The adapter normalizes protocol-level data only. `AiGateway` still decides whether a factual claim is valid/authoritative.

Examples:

- model-declared price without current `transport.search` evidence → rejected;
- model-declared Legal fact from Knowledge only → rejected;
- stale protected fact → rejected;
- current matching tool evidence → may become authoritative only after Gateway evaluation.

## Golden semantic evaluation boundary

`server/travel/qwenGoldenEvaluation.ts` introduces a mandatory distinction between:

- structural/schema success;
- semantic claim-coverage success.

Critical golden scenarios cover unsupported/stale/protected facts and structured-claim coverage.

For externally-checkable prose cases, `semanticCoveragePassed=true` must be explicitly supplied. Missing/false verdict fails closed.

Current tests use deterministic fixtures to validate this harness. They do **not** claim that an actual Qwen3-8B runtime has passed semantic evaluation.

Before real model activation, golden cases must be executed against the actual deployed candidate and semantic coverage must be evaluated by an approved deterministic/reviewed process.

## Signal-bearing security tests

`test:qwen-runtime-evaluation` covers:

- remote insecure endpoint rejection;
- base URL credential rejection;
- account-scope non-leakage;
- structured-output mapping;
- tool allowlist mapping;
- unknown tool rejection;
- malformed tool arguments/answer rejection;
- HTTP failure;
- cancellation;
- adapter timeout;
- Gateway rejection of unsupported price;
- tool-backed protected fact flow;
- golden semantic coverage fail-closed behavior.

Existing AI Engine, Retrieval, PostgreSQL/pgvector, Plan, Transport, Map, Legal, Yandex and Trip regressions remain mandatory.

## Production / real-model STOP boundary

No production GPU, vLLM server, model weights, runtime endpoint, model credential, paid AI API, production embedding activation, crawler or automatic external Knowledge ingestion is authorized.

No merge to `main`, production deployment or destructive migration is authorized.

A future real-model deployment requires separate approval for runtime topology, exact model/version/checksum/licensing, endpoint authentication/networking, secrets, capacity/cost limits, live golden semantic evaluation, monitoring/rollback and privacy/data-transfer review.
