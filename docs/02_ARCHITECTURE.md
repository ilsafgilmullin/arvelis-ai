# ARVELIS AI — архитектура

**Актуальность:** Free Local Qwen Live Evaluation V1, 2026-09-12.

## Core invariants

- `Trip` remains the core product aggregate;
- UI, domain, persistence, retrieval, orchestration, model runtime and provider adapters remain separate layers;
- authenticated server session is authoritative for ownership;
- provider/retriever/model output is untrusted until deterministic validation;
- protected external facts require matching current normalized tool evidence;
- secrets remain server-side;
- private account Knowledge never becomes Global Knowledge implicitly;
- user Trips/documents/conversations are not training data by default;
- runtime-vendor details do not enter `AiGateway`.

## Closed lower layers

The stacked Travel/AI foundations remain unchanged, including:

- Trip persistence/API;
- Plan/Transport/Map/Legal provider-neutral foundations;
- AI Engine & Knowledge Foundation;
- Retrieval & Knowledge Ingestion Foundation V1 — PostgreSQL + pgvector, additive migration `003`, strict namespace isolation;
- Qwen Runtime Adapter & AI Evaluation V1 — Draft PR #37, final HEAD `b5685472efdaaea57e674911a852f0bf9bf7aa78`.

The Qwen Runtime/Evaluation slice established the future production-oriented path:

`AiGateway → AiModelRuntime → QwenVllmRuntime → OpenAI-compatible vLLM`.

It did not deploy a real model.

## Provider-neutral AI Engine

`server/travel/aiGateway.ts` remains the application policy/orchestration boundary and is unchanged by Free Local Qwen Live Evaluation V1.

`AiGateway` owns:

- request/context validation;
- authenticated account/trip authorization boundary;
- optional Knowledge retrieval;
- allowlisted tool exposure/execution;
- bounded tool/evidence rounds;
- model-turn validation;
- protected-fact evidence enforcement;
- overall timeout/cancellation;
- sanitized audit metadata.

`server/travel/aiEnginePorts.ts` keeps the model boundary replaceable:

`AiModelRuntime.generate(AiRuntimeInput, AbortSignal) → Promise<AiModelTurn>`.

Server `accountScopeId` is not part of `AiRuntimeInput`.

## Two Qwen runtime roles

### Future production-oriented runtime

`server/travel/runtimes/qwenVllmRuntime.ts`

Path:

`AiGateway → AiModelRuntime → QwenVllmRuntime → vLLM`.

This remains the approved production-oriented architecture candidate. No production vLLM endpoint, GPU, weights or credentials are activated.

### Free local development/evaluation runtime

`server/travel/runtimes/qwenLlamaCppRuntime.ts`

Path:

`AiGateway → AiModelRuntime → QwenLlamaCppRuntime → llama.cpp loopback → Qwen3-8B GGUF`.

This runtime exists only to qualify the real model for free on suitable local compute. It is not a production backend and cannot address a remote server.

## Local runtime endpoint boundary

`QwenLlamaCppRuntime` accepts only an OpenAI-compatible `/v1` base URL on HTTP loopback:

- `127.0.0.1`;
- `localhost`;
- `::1`.

It rejects:

- any remote host;
- HTTPS/remote production-style endpoint;
- username/password in URL;
- query/fragment;
- non-`/v1` path.

Network redirects use `redirect: error`.

The local llama.cpp server must bind to loopback only. No tunnel, public forwarding or external exposure is part of this architecture.

## Pinned artifact/runtime identity

`config/qwen-local-live-model-manifest.v1.json` is the source of truth for local live qualification:

- repo: `Qwen/Qwen3-8B-GGUF`;
- revision: `7c41481f57cb95916b40956ab2f0b139b296d974`;
- file: `Qwen3-8B-Q4_K_M.gguf`;
- SHA-256: `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`;
- size: `5,027,783,488` bytes;
- quantization: `Q4_K_M`;
- local model alias: `arvelis-qwen3-8b-q4-k-m-v1`;
- llama.cpp release: `b10902`;
- llama.cpp commit: `df03399b885831b2a1603b3abb0d8c156808e363`.

GGUF/binary files are not repository artifacts. Quantized Q4 evaluation is not equivalent to BF16/vLLM production behavior.

## llama.cpp protocol mapping

The local adapter intentionally has a separate implementation rather than reusing the vLLM request builder blindly.

For the pinned llama.cpp/Qwen3 path it emits:

- OpenAI-compatible `POST /v1/chat/completions`;
- system + user messages;
- runtime context derived from `AiRuntimeInput`;
- current exposed tool descriptors;
- `tool_choice`;
- strict `response_format.type=json_schema`;
- `chat_template_kwargs.enable_thinking=false`;
- `reasoning_effort=none`;
- bounded output tokens;
- explicit sampling profile.

The corresponding local server launch requires `--jinja` for tool-capable Qwen templates and `--reasoning off` for the pinned server path.

If the real pinned llama.cpp/Qwen3 combination cannot preserve correct structured output/tool calling, the live evaluation fails. No fallback parser or heuristic repair is authorized.

## Structured output and tool mapping

Local runtime function names remain adapter-local:

- `trip.read` ↔ `trip_read`;
- `transport.search` ↔ `transport_search`;
- `map.route` ↔ `map_route`;
- `legal.check` ↔ `legal_check`.

Fail-closed parsing rejects:

- unknown function;
- function not exposed in the current request;
- invalid/duplicate call ID;
- malformed/oversized JSON arguments;
- non-object arguments;
- malformed Chat Completion shape;
- malformed JSON final answer;
- free-form answer where structured answer is required.

The normalized turn still passes through the existing `validateAiModelTurn`; then `AiGateway` performs full evidence/protected-fact validation.

## Execution bounds

Local adapter provides:

- caller `AbortSignal` propagation;
- independent default timeout 90 seconds, maximum 120 seconds;
- bounded output tokens;
- maximum response body 1,000,000 bytes;
- strict non-2xx handling;
- no heuristic model-output repair.

The longer development timeout is intentional for CPU/free-local Q4 evaluation and does not change the existing vLLM adapter timeout policy.

## Sampling profiles

Normal Qwen profile:

- temperature `0.7`;
- top_p `0.8`;
- top_k `20`;
- random seed `-1`.

Reproducibility profile:

- temperature `0`;
- top_p `1`;
- top_k `1`;
- fixed seed `424242`.

The reproducibility profile is an evaluation aid, not a security primitive.

## Live-evaluation architecture

`server/travel/qwenLocalLiveEvaluation.ts` is an explicit development runner and is intentionally excluded from the normal server runtime bundle.

It reuses:

- `QWEN_GOLDEN_CASES`;
- `runQwenGoldenEvaluation()`;
- actual `AiGateway`;
- actual `QwenLlamaCppRuntime`.

External providers are not used. Legal retrieval and Transport tool responses are deterministic synthetic fixtures so the evaluated variable is model/runtime behavior rather than provider availability.

The existing golden set is extended with an unknown-tool case rather than creating a second framework.

Default live execution performs:

- 3 normal generations per case;
- 1 reproducibility generation per case.

## Semantic qualification

The report keeps four boundaries separate:

1. structured/schema validation;
2. protected-fact policy result;
3. explicit semantic coverage review;
4. final qualification.

`semanticCoveragePassed` is never inferred from JSON validity. Cases marked `requiresSemanticCoverage=true` require a separate explicit review verdict. Missing review forces `NOT_QUALIFIED`.

## Local artifacts and report

`.gitignore` excludes:

- `.local-models/`;
- `.local-eval/`;
- `*.gguf`;
- local compiled evaluation outputs.

Raw synthetic exchanges are stored locally under `.local-eval/qwen/raw/` only. The sanitized typed report contains artifact/runtime identity, run counts, structural/policy/semantic results, latency and trustworthy server-returned throughput metrics when available; it excludes credentials, real account IDs and production/private data.

## Preflight and explicit CLI

`scripts/qwen-local-live-eval.mjs` is invoked only through:

`npm run eval:qwen-local-live -- --preflight`

or, after a verified local server is already running:

`npm run eval:qwen-local-live -- --run`.

It does not install software, download GGUF, start a model server or provision infrastructure.

Preflight verifies architecture/OS, RAM, disk, llama.cpp version and local-port state. Run mode additionally verifies exact model size/SHA, loopback listener exposure, `/health` and expected `/v1/models` alias.

## Replit boundary

`.replit` is unchanged. Replit remains only the normal web/backend development environment.

No llama.cpp build, GGUF download, model startup, GPU/CUDA setup or model cache occurs during `npm ci`/`npm run dev`.

## Verification state

Implementation run #730 proved the new deterministic adapter gate itself was green, but exposed strict optional-property typing in the first live-report implementation during server build. That defect was corrected, and the live evaluator was also moved out of the normal server runtime bundle.

Run #733 on implementation HEAD `a959d8b46c0922cc1359026301ec5681f976dffb` then passed:

- dependency audit;
- typecheck;
- Plan/Transport/Map/Legal;
- AI Engine;
- Retrieval;
- existing Qwen Runtime/Evaluation;
- new Free Local Qwen llama.cpp adapter gate;
- Yandex/Trip;
- server runtime build;
- server-backed Chromium happy-path;
- frontend build.

The deterministic gate also compile-checks the live evaluator; subsequent package wiring adds a syntax check for the explicit CLI.

## Current live-model state

A real Qwen3-8B GGUF has **not** been run.

The free execution environment inspected for this task provides approximately 5.8 GiB total RAM, no swap and no pinned `llama-server`; although disk space is sufficient, this fails the pinned Qwen3-8B Q4 preflight requirements. No model file was downloaded and no smaller model was substituted.

Truthful state:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

## STOP boundary

No paid GPU/cloud, paid inference API, production runtime/deploy, production credentials, public llama.cpp endpoint, merge to `main`, destructive migration, Trip Domain change, crawler/production Knowledge ingestion or embedding deployment is authorized by this slice.
