# ARVELIS Qwen Runtime Adapter & AI Evaluation V1

**Date:** 2026-09-10  
**Branch:** `feat/travel-qwen-runtime-evaluation-v1`  
**Base:** `feat/travel-retrieval-knowledge-ingestion-v1` / Draft PR #36  
**Starting base HEAD:** `aab7f49c1dfc0909536e1afba7da84bcdf98be3d`

## Purpose

This slice implements the first concrete model-runtime adapter behind the existing vendor-neutral `AiModelRuntime` interface and adds a fail-closed golden evaluation harness.

It does **not** deploy Qwen, vLLM, GPU infrastructure or model weights. No production endpoint or credential is configured. The adapter is compiled and tested against deterministic OpenAI-compatible response fixtures only.

## Architectural position

Existing boundaries remain unchanged:

`AiGateway → AiModelRuntime → QwenVllmRuntime → OpenAI-compatible /v1/chat/completions`

`AiGateway` remains responsible for product/security policy:

- account/trip authorization context;
- retriever/tool orchestration;
- protected-fact evidence requirements;
- model-turn validation;
- claim authority evaluation;
- global timeout/cancellation boundary.

`QwenVllmRuntime` is responsible only for runtime/vendor protocol concerns:

- endpoint/model configuration validation;
- ARVELIS runtime input → vLLM Chat Completions request mapping;
- structured-output schema mapping;
- OpenAI-style tool-call mapping;
- Qwen non-thinking request configuration;
- adapter timeout/caller cancellation;
- bounded HTTP response handling;
- untrusted vLLM response parsing/normalization.

No Qwen/vLLM-specific code was added to `AiGateway`.

## Runtime adapter

File:

`server/travel/runtimes/qwenVllmRuntime.ts`

Implements:

`AiModelRuntime.generate(input, AbortSignal) → AiModelTurn`.

Runtime ID:

`qwen3-8b-vllm-v1`.

Default model selector:

`Qwen/Qwen3-8B`.

This selector is request configuration only; no model is downloaded or started by ARVELIS in this slice.

## Endpoint policy

The adapter accepts an OpenAI-compatible base URL ending in `/v1`.

Security policy:

- remote endpoint must use HTTPS;
- HTTP is allowed only for loopback development (`localhost`, `127.0.0.1`, `::1`);
- credentials, query parameters and fragments are forbidden inside the base URL;
- optional API key is accepted only through constructor/runtime configuration and is never hard-coded;
- this slice does not provide or activate any API key.

The adapter calls:

`POST /v1/chat/completions`.

## Qwen/vLLM request mapping

The adapter maps normalized `AiRuntimeInput` to OpenAI-style chat messages.

Model-visible input contains:

- request ID;
- locale/scope;
- already-authorized Trip ID when present;
- normalized evidence;
- tool descriptors actually exposed by the Gateway;
- user prompt.

It does **not** contain `accountScopeId` because that value remains server-only in `AiGatewayServerContext`.

Evidence is serialized inside an explicitly marked runtime-context JSON block and is described to the model as untrusted data, not instructions.

## Structured output

Final answers use OpenAI-compatible `response_format.type = json_schema`.

The strict JSON schema mirrors the existing `AiStructuredAnswer` contract:

- version = 1;
- exact request ID;
- bounded user-visible message;
- bounded claims;
- claim ID;
- fact domain;
- `fact | inference` mode;
- evidence IDs.

The adapter parses JSON content into an `AiModelTurn` and runs existing model-turn contract validation before returning it to the Gateway.

Gateway validation remains authoritative for evidence references, protected facts and claim authority. The adapter intentionally does not duplicate those policy rules.

## Tool calling

Existing ARVELIS tool IDs contain dots, while model function names use stable adapter-local names:

- `trip.read` → `trip_read`;
- `transport.search` → `transport_search`;
- `map.route` → `map_route`;
- `legal.check` → `legal_check`.

The reverse mapping is private to the adapter.

vLLM `tool_calls` are accepted only when:

- there are 1–4 calls;
- call IDs are bounded/valid and unique;
- call type is `function`;
- function name maps to an ARVELIS tool that is actually exposed in the current runtime input;
- arguments are bounded valid JSON objects.

Unknown function names, malformed arguments or unavailable tools fail closed as `invalid_response` before the Gateway executes anything.

The current vendor-neutral `AiToolDescriptor` does not include per-tool JSON input schemas. Therefore the vLLM function parameter schema is intentionally generic at the adapter boundary; the existing `AiToolRegistry` remains the authoritative validator/executor for tool input/output. A future typed tool-schema extension must remain provider-neutral rather than being added only for Qwen.

## Qwen non-thinking mode

The adapter uses Qwen3/vLLM request settings:

- `chat_template_kwargs.enable_thinking = false`;
- `temperature = 0.7`;
- `top_p = 0.8`;
- `top_k = 20`;
- bounded `max_tokens` (default 4096; allowed 256–8192).

Reasoning content is not part of the ARVELIS contract and is not persisted/exposed by the adapter.

Official Qwen/vLLM documentation confirms that Qwen3 can disable thinking through `chat_template_kwargs.enable_thinking=false`, and that vLLM can parse Qwen3 tool calls when the future server is configured appropriately. Server deployment flags are intentionally not activated by this slice.

## Cancellation / timeout

The adapter has its own bounded timeout:

- default: 25 seconds;
- maximum configuration: 120 seconds.

Caller `AbortSignal` is propagated to the HTTP request.

Adapter errors distinguish:

- `aborted`;
- `timeout`;
- `http_error`;
- `response_too_large`;
- `invalid_response`;
- `invalid_configuration`.

The existing Gateway still applies its independent global execution timeout/cancellation policy.

## Response trust boundary

vLLM/model output is untrusted.

Before normalization the adapter requires:

- JSON HTTP body;
- exactly one Chat Completion choice;
- assistant message;
- valid native tool-call collection or JSON structured answer;
- bounded body size;
- valid mapped tool IDs/JSON arguments;
- existing ARVELIS model-turn validation.

A syntactically valid structured answer is **not** automatically considered factually safe. Protected-fact authority remains inside the Gateway.

## Golden semantic evaluation harness

File:

`server/travel/qwenGoldenEvaluation.ts`.

The golden set contains critical semantic scenarios:

1. general advice remains inference;
2. unsupported price fails closed;
3. tool-backed current price may become authoritative;
4. Knowledge-only Legal fact fails closed;
5. stale protected fact fails closed;
6. externally-checkable prose must have structured-claim coverage.

The harness deliberately separates schema validity from semantic coverage.

For cases requiring semantic claim coverage, the evaluation observation must explicitly provide:

`semanticCoveragePassed: true`.

Missing or false semantic coverage fails the gate. The harness does not silently infer semantic correctness from JSON-schema success.

In this non-deployment slice, deterministic fixtures verify the harness itself. No claim is made that a live Qwen3-8B model has passed the golden suite, because no model is deployed or downloaded.

Before any future real-model activation, the same harness must be executed against the actual candidate runtime, with semantic coverage supplied by an approved deterministic/reviewed evaluation process.

## Signal-bearing test

Command:

`npm run test:qwen-runtime-evaluation`

Covers:

- remote HTTP endpoint rejection / loopback HTTP allowance;
- no account-scope leakage into model payload;
- Qwen/vLLM structured-output request mapping;
- non-thinking/sampling configuration;
- ARVELIS tool ID ↔ vLLM function name mapping;
- valid native tool call normalization;
- unknown tool fail-closed;
- malformed tool arguments fail-closed;
- malformed structured answer fail-closed;
- non-2xx HTTP failure;
- caller cancellation;
- adapter timeout;
- unsupported protected price rejection through the unchanged `AiGateway`;
- two-round tool-backed price flow through `AiGateway` + `AiToolRegistry`;
- golden semantic gate failure when semantic coverage is missing;
- golden gate success only when every required observation is complete.

No new UI/browser test was added for this backend/runtime slice. Existing server-backed browser regression remains in the general CI pipeline.

## First implementation CI feedback

Initial push run #722 reached the new Qwen gate after all preceding foundation tests passed and exposed a strict TypeScript issue caused by `exactOptionalPropertyTypes` on the optional API-key class field.

The fix changed the internal field type to explicit `string | undefined`; runtime/auth behavior was not weakened.

Push run #723 on `d202c5632ecd923a8e0ce2e9d0f38e8214023d53` then passed:

- dependency audit;
- project typecheck;
- Plan/Transport/Map/Legal regressions;
- AI Engine gate;
- Retrieval/Knowledge gate;
- Qwen Runtime/Evaluation gate;
- Yandex regression;
- Trip server regression;
- server runtime build;
- server-backed Chromium regression;
- frontend build.

Final closure still requires the stacked Draft PR checkpoint on the exact documentation HEAD.

## Explicit non-goals

This slice does not:

- start a vLLM server;
- install CUDA/GPU runtime;
- download Qwen model weights;
- activate a remote model endpoint;
- add model credentials;
- use a paid AI API;
- activate Qwen3-Embedding-0.6B;
- add a crawler or automatic external Knowledge ingestion;
- alter `AiGateway` with Qwen/vLLM logic;
- merge to `main`;
- deploy production;
- perform a destructive migration.

## Final STOP boundary

After the Qwen Runtime Adapter & AI Evaluation V1 Draft PR is green, stop before real model deployment.

A future deployment step requires separate explicit approval for at least:

- GPU/runtime hosting topology;
- model-weight source/version/checksum/licensing review;
- concrete vLLM version and server flags;
- endpoint/network/auth policy;
- production secrets;
- capacity/latency/cost limits;
- live Qwen golden semantic evaluation;
- operational monitoring and rollback;
- production data/privacy impact review.
