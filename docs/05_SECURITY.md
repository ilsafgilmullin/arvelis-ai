# ARVELIS AI — безопасность

**Актуальность:** Free Local Qwen Live Evaluation V1, 2026-09-12.

## Global invariants

- Account/Session and Trip ownership remain server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider/model secrets remain server-side;
- provider/retriever/tool/model output is untrusted input;
- raw prompt/evidence/model response/secrets are not operational audit payloads by default;
- private account Knowledge and Global Knowledge remain isolated;
- user Trips/documents/conversations are not training data by default;
- model inference never becomes an authoritative protected fact without required evidence/tool policy;
- local development/evaluation runtime must not become a public inference service.

## AiGateway remains authoritative

`AiGateway` is unchanged by this slice and remains vendor-neutral.

It owns request/context validation, account/trip authorization, optional retrieval, allowlisted tools, bounded rounds, model-turn validation, protected-fact enforcement, cancellation/timeout and sanitized audit metadata.

`accountScopeId` is absent from `AiRuntimeInput`, so neither `QwenVllmRuntime` nor `QwenLlamaCppRuntime` receives it through the model-runtime contract.

## Runtime separation

`QwenVllmRuntime` and `QwenLlamaCppRuntime` are intentionally not interchangeable deployment classifications.

- `QwenVllmRuntime`: future production-oriented vLLM adapter; remote endpoints require HTTPS; no production endpoint/credential is active.
- `QwenLlamaCppRuntime`: local development/evaluation adapter only; it accepts HTTP loopback and rejects all remote hosts.

The local adapter is not a fallback production service and must never be exposed to end users directly.

## Local endpoint boundary

Allowed llama.cpp base hosts:

- `127.0.0.1`;
- `localhost`;
- `::1`.

Required path: `/v1`.

Rejected before network execution:

- remote host;
- public IP/hostname;
- HTTPS production-style endpoint;
- credentials embedded in URL;
- query/fragment;
- unexpected base path.

Fetch redirects are disabled (`redirect: error`).

The local server command must use loopback `--host 127.0.0.1`. ngrok, cloudflared, public tunnels, public port forwarding and `0.0.0.0` inference exposure are forbidden in this slice.

## Artifact integrity boundary

Live qualification is bound to the committed metadata manifest, not floating `main`:

- model: `Qwen/Qwen3-8B-GGUF`;
- immutable revision: `7c41481f57cb95916b40956ab2f0b139b296d974`;
- file: `Qwen3-8B-Q4_K_M.gguf`;
- exact size: `5,027,783,488` bytes;
- expected SHA-256: `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`;
- llama.cpp release: `b10902`;
- llama.cpp commit: `df03399b885831b2a1603b3abb0d8c156808e363`.

Run mode recalculates the local GGUF SHA-256 before evaluation. Size/hash/version mismatch blocks the run.

Weights and binaries are not committed. `.gitignore` excludes `.local-models/`, `.local-eval/` and `*.gguf`.

## Replit / lifecycle safety

`.replit` is unchanged.

Forbidden automatic lifecycle behavior:

- no 5+ GB model download during `npm install`/`npm ci`;
- no llama.cpp build/install during normal dependency install;
- no model startup from `npm run dev`;
- no CUDA/GPU setup;
- no committed model cache.

Replit remains the ordinary ARVELIS web/backend dev environment and is not an inference host.

## Preflight fail-closed boundary

`scripts/qwen-local-live-eval.mjs` does not repair machines or provision anything.

Preflight checks:

- OS/architecture;
- total RAM;
- available RAM;
- free disk;
- `llama-server` presence;
- observed pinned version/commit;
- loopback host and port availability.

Run mode additionally verifies:

- exact local GGUF size;
- SHA-256;
- listener not exposed publicly;
- local `/health`;
- expected `/v1/models` alias.

If listener exposure cannot be verified, the run fails closed rather than assuming privacy.

## Runtime request minimization

The local request contains only normalized `AiRuntimeInput` information needed by the model:

- request ID;
- locale/scope;
- authorized Trip ID when applicable;
- bounded evidence;
- current exposed tool descriptors;
- user/evaluation prompt.

It does not contain authenticated account scope, cookies, OTP data, DB credentials or provider credentials.

The deterministic adapter test asserts no `accountScopeId` appears in the serialized request.

## Structured output boundary

The local adapter requests JSON-schema structured output and treats the returned body as untrusted data.

Fail-closed conditions include:

- oversized response;
- non-2xx response;
- malformed HTTP JSON body;
- wrong/missing choice/message shape;
- non-assistant response;
- plain free-form final answer;
- wrong request ID/version/claim shape;
- malformed tool call/arguments.

There is no heuristic extraction, repair or coercion of invalid model prose into a trusted ARVELIS answer.

Existing `validateAiModelTurn` is not weakened.

## Tool-call boundary

Fixed runtime function mapping:

- `trip_read` → `trip.read`;
- `transport_search` → `transport.search`;
- `map_route` → `map.route`;
- `legal_check` → `legal.check`.

A local-model tool call is accepted only when the function is known **and** the corresponding tool is exposed in the current `AiRuntimeInput.tools`.

Unknown tool such as `shell_exec`, unavailable known tool, duplicate/invalid call ID, malformed JSON or non-object arguments fail closed before server execution.

Actual tool execution remains inside `AiToolRegistry`, which stamps trusted provenance.

## Prompt injection / protected facts

Evidence is labelled as data, but security never relies on model obedience.

`AiGateway` still rejects protected claims that do not have matching current authorized tool evidence. A local Qwen model cannot promote its own prose or RAG chunk into authoritative price/schedule/legal/map data.

The local live evaluation deliberately uses deterministic synthetic retrieval and tool fixtures so no real provider access or private data is required.

## Thinking / template boundary

The client request sends:

- `chat_template_kwargs.enable_thinking=false`;
- `reasoning_effort=none`.

The pinned local-server launch also uses `--jinja` and `--reasoning off`.

If the pinned llama.cpp/Qwen3 template does not produce safe structured/tool output under these settings, that is a live evaluation failure. ARVELIS must not loosen schema or tool policies to accommodate it.

## Cancellation / resource bounds

Local adapter controls:

- caller cancellation;
- default timeout 90 seconds;
- maximum timeout 120 seconds;
- bounded output tokens;
- bounded tool argument size/count through existing contracts;
- response body maximum 1,000,000 bytes.

The development timeout is longer than the vLLM adapter because CPU/local Q4 generation may be slower. It does not alter production-oriented runtime policy.

## Golden semantic evaluation boundary

The existing `QWEN_GOLDEN_CASES` and `runQwenGoldenEvaluation()` remain the single semantic evaluation foundation.

The set now includes an explicit unknown-tool scenario in addition to unsupported price, tool-backed price, Knowledge-only Legal, stale evidence, general inference and externally-checkable prose coverage.

The live runner separates:

- schema validation;
- protected-fact policy;
- semantic coverage;
- final qualification.

For `requiresSemanticCoverage=true`, only a separately supplied explicit reviewed verdict can set semantic coverage to pass. Valid JSON, successful tool execution or correct schema never auto-sets `semanticCoveragePassed=true`.

Missing semantic review means final status `NOT_QUALIFIED`.

## Repeated-generation requirement

Live Qwen is nondeterministic. Default qualification runs each case three times in the normal profile and once in a fixed-seed reproducibility profile.

Critical failures cannot be waived because another generation succeeded. One lucky output is not qualification evidence.

## Evaluation artifacts / privacy

Sanitized report may contain:

- model/revision/file/hash/quantization;
- llama.cpp release/commit/version;
- adapter/context/sampling metadata;
- case/run counts;
- validation/policy/semantic verdicts;
- tool execution counts;
- timeout/error counts;
- latency;
- server-reported throughput when numeric/trustworthy.

It must not contain:

- credentials;
- real account IDs;
- session identifiers;
- real user prompts;
- private Trip data;
- production data.

Raw synthetic model transcripts are local-only in gitignored `.local-eval/qwen/raw/`.

## Signal-bearing CI

`test:qwen-llamacpp-runtime` is the one primary deterministic adapter gate. It uses a local fake HTTP server and no GGUF.

It covers loopback/remote policy, request/schema/thinking/tool mapping, malformed/free-form output, unknown/unavailable/malformed tools, timeout, cancellation and response-size bound. The same gate compile-checks the live runner and syntax-checks the explicit CLI.

A real Qwen3-8B model is intentionally excluded from GitHub CI to avoid multi-gigabyte downloads and to prevent CI from masquerading as a free live-model qualification environment.

Existing Qwen/AI/Retrieval/PostgreSQL/Plan/Transport/Map/Legal/Yandex/Trip regressions remain mandatory.

## Current free-compute truth boundary

The inspected free environment has ~5.8 GiB total RAM, no swap, adequate disk but no pinned `llama-server`. This is below the manifest minimum for Qwen3-8B Q4.

Therefore:

- no GGUF was downloaded;
- no real Qwen3-8B was started;
- no live golden report exists;
- no smaller model was substituted;
- deterministic engineering PASS must not be described as model qualification.

Status:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

## Hard STOP boundary

No paid GPU/cloud, paid inference API, production deployment, production credentials, public llama.cpp endpoint, production embedding, crawler/production Knowledge ingestion, destructive migration, Trip Domain change or merge to `main` is authorized by this slice.
