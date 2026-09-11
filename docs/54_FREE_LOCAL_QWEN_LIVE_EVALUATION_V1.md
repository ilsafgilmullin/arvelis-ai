# ARVELIS AI — Free Local Qwen Live Evaluation V1

**Status:** `ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`

This slice adds a free, local-only development/evaluation path for the approved Qwen3-8B candidate without changing the future production-oriented runtime design.

## Runtime separation

Two concrete `AiModelRuntime` adapters now have different roles:

- `QwenVllmRuntime` — future production-oriented OpenAI-compatible vLLM adapter. It is not deployed by this slice.
- `QwenLlamaCppRuntime` — free local development/evaluation adapter for a loopback-only llama.cpp server. It is not a production runtime and cannot target a remote host.

`AiGateway` remains vendor-neutral and unchanged. The local path is:

`AiGateway → AiModelRuntime → QwenLlamaCppRuntime → llama.cpp localhost → Qwen3-8B GGUF`.

## Pinned model artifact

The reproducibility manifest is committed as `config/qwen-local-live-model-manifest.v1.json`.

Target:

- repository: `Qwen/Qwen3-8B-GGUF`;
- immutable revision: `7c41481f57cb95916b40956ab2f0b139b296d974`;
- file: `Qwen3-8B-Q4_K_M.gguf`;
- quantization: `Q4_K_M`;
- expected file size: `5,027,783,488` bytes;
- expected SHA-256: `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`;
- license: Apache-2.0;
- local runtime alias: `arvelis-qwen3-8b-q4-k-m-v1`.

GGUF files are excluded by `.gitignore`. A quantized Q4 result is an evaluation result for this local path only and must not be represented as equivalent to the future BF16/vLLM production baseline.

## Pinned llama.cpp

The local server target is pinned to:

- release: `b10902`;
- commit: `df03399b885831b2a1603b3abb0d8c156808e363`.

No llama.cpp binary is committed. The explicit preflight checks the observed `llama-server --version` output against the pinned release/commit before a live evaluation can run.

The pinned server supports the OpenAI-compatible Chat Completions boundary used here, Jinja chat templates, tools/tool choice and JSON-schema response formatting. Qwen3 thinking is disabled both through the request metadata (`chat_template_kwargs.enable_thinking=false`, `reasoning_effort=none`) and the documented server launch flag `--reasoning off`. If this pinned combination does not provide correct Qwen3 tool calling or structured output in a real run, that is an evaluation failure; ARVELIS validation must not be weakened to compensate.

## Local-only network policy

`QwenLlamaCppRuntime` accepts only:

- `http://127.0.0.1:<port>/v1`;
- `http://localhost:<port>/v1`;
- `http://[::1]:<port>/v1`.

Remote hosts, HTTPS endpoints, embedded credentials, query strings, fragments and non-`/v1` base paths are rejected.

The local server must never be exposed using a public bind, ngrok, cloudflared, public tunnel or public port forwarding.

## Explicit preflight

Nothing is downloaded or installed automatically by `npm ci`, `npm run dev` or Replit.

Run only on a suitable free local machine:

```bash
npm ci
npm run eval:qwen-local-live -- --preflight
```

Preflight checks:

- OS and architecture;
- total and available RAM;
- free disk space;
- pinned `llama-server` presence/version;
- local port availability;
- loopback host configuration.

Current manifest thresholds are intentionally conservative for Qwen3-8B Q4:

- total RAM: at least 10 GiB;
- currently available RAM: at least 8 GiB;
- free disk: at least 7 GiB;
- context: 8192 tokens;
- max output: 2048 tokens.

The current free execution environment inspected during this slice has only about 5.8 GiB total RAM, no swap, and no `llama-server`. Therefore the real GGUF was **not downloaded** and the live model was **not executed**. A smaller model was not substituted.

## Manual artifact acquisition after a passing preflight

Artifact acquisition is deliberately not an npm lifecycle script. After preflight passes, an operator may download the exact file from the immutable Hugging Face revision into the gitignored model directory, for example with an already-installed Hugging Face CLI:

```bash
hf download Qwen/Qwen3-8B-GGUF Qwen3-8B-Q4_K_M.gguf \
  --revision 7c41481f57cb95916b40956ab2f0b139b296d974 \
  --local-dir .local-models/qwen3-8b
```

Then verify the actual downloaded bytes before launch:

```bash
sha256sum .local-models/qwen3-8b/Qwen3-8B-Q4_K_M.gguf
```

Expected SHA-256:

`d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`

A mismatch blocks evaluation.

## Explicit local llama.cpp launch

After the binary and artifact independently pass verification:

```bash
llama-server \
  -m .local-models/qwen3-8b/Qwen3-8B-Q4_K_M.gguf \
  --alias arvelis-qwen3-8b-q4-k-m-v1 \
  --host 127.0.0.1 \
  --port 8080 \
  --jinja \
  --reasoning off \
  -c 8192 \
  -n 2048
```

No automatic startup is added to `.replit`, `npm run dev`, `npm ci` or GitHub Actions.

## Live evaluation command

With the pinned server already running on loopback:

```bash
npm run eval:qwen-local-live -- --run
```

The run command fails closed unless it can confirm:

- the model file exists at the expected local path;
- exact file size and SHA-256 match the manifest;
- pinned llama.cpp version is observed;
- the configured listener is not publicly exposed;
- `/health` succeeds;
- `/v1/models` exposes exactly the expected ARVELIS model alias.

The CLI does not install llama.cpp, download weights, provision infrastructure or repair a failed machine automatically.

## Adapter policy

`server/travel/runtimes/qwenLlamaCppRuntime.ts` implements the existing `AiModelRuntime` and preserves the existing `validateAiModelTurn` boundary.

It provides:

- OpenAI-compatible `/v1/chat/completions`;
- system/user messages;
- current ARVELIS tool descriptors;
- `tool_choice`;
- strict JSON-schema structured answer request;
- normal and reproducibility sampling profiles;
- caller cancellation;
- independent bounded timeout;
- bounded response body;
- strict HTTP/JSON/choice/message parsing;
- fail-closed unknown/unavailable tools;
- fail-closed malformed tool arguments;
- fail-closed free-form final answers;
- no heuristic repair of invalid model output.

Normal profile:

- temperature `0.7`;
- top_p `0.8`;
- top_k `20`;
- random seed (`-1`).

Reproducibility profile:

- temperature `0`;
- top_p `1`;
- top_k `1`;
- fixed seed `424242`.

The reproducibility profile reduces variance but does not convert model output into a deterministic security boundary.

## Golden evaluation reuse

There is no second evaluation framework.

`server/travel/qwenLocalLiveEvaluation.ts` reuses:

- `QWEN_GOLDEN_CASES`;
- `runQwenGoldenEvaluation()`;
- the real `AiGateway`;
- the real `QwenLlamaCppRuntime`.

The golden set includes:

- general advice remains inference;
- unsupported price fails closed;
- current tool-backed price may be authoritative;
- Knowledge-only Legal fact fails closed;
- stale protected fact fails closed;
- unknown/unregistered tool fails closed;
- externally-checkable prose requires structured-claim coverage.

Tool and retrieval evidence in this evaluation are deterministic synthetic fixtures. No Yandex Rasp, Legal provider or production data is activated to qualify the model itself.

Default live profile executes three normal runs per case plus one reproducibility run per case. This prevents one lucky generation from being treated as qualification evidence.

## Semantic coverage boundary

The report keeps separate concepts:

- schema/structured validation;
- protected-fact policy;
- explicit semantic coverage review;
- overall qualification.

For every golden case with `requiresSemanticCoverage=true`, a separate explicit semantic review verdict is required. The live harness never derives `semanticCoveragePassed=true` merely from valid JSON or a successful tool call.

A local review JSON may be supplied through `QWEN_LOCAL_SEMANTIC_REVIEW_FILE`. Missing review leaves the case `not_reviewed` and the final report remains `NOT_QUALIFIED`.

## Evaluation artifacts and privacy

Sanitized typed report includes:

- model repository/revision/file/SHA/quantization;
- llama.cpp release/commit/observed version;
- adapter/version;
- context and sampling profile;
- cases/runs;
- structured validation rate;
- protected-fact violations;
- tool execution summary;
- semantic verdicts;
- timeout/error counts;
- latency summary;
- tokens/sec only when the local server returns a numeric timing metric;
- final qualification status/reasons.

It does not include credentials, real account IDs, private Trip data or production/user prompts.

Raw synthetic model exchanges are local-only under `.local-eval/qwen/raw/` and are gitignored together with `.local-models/` and all `*.gguf` files.

## Deterministic engineering gate

`tests/qwen-llamacpp-runtime-smoke.ts` is the single primary deterministic adapter test. It runs a local fake HTTP server and needs no GGUF.

It verifies:

- loopback accepted;
- remote endpoint rejected;
- request mapping;
- normal/reproducibility sampling;
- thinking-off metadata;
- strict response schema;
- tool mapping;
- malformed response JSON rejected;
- free-form answer rejected;
- unknown/unavailable tool rejected;
- malformed tool arguments rejected;
- timeout;
- cancellation;
- response-size bound;
- local exchange metric capture.

`npm run test:qwen-llamacpp-runtime` also compiles the explicit live evaluator and syntax-checks `scripts/qwen-local-live-eval.mjs`.

The actual 5+ GB model is never downloaded in GitHub CI.

## Replit boundary

`.replit` remains an ordinary ARVELIS web/backend development environment. It is intentionally unchanged by this slice.

No model download, llama.cpp build, model server startup, GPU/CUDA setup or large model cache is attached to Replit startup/install commands.

## Definition of Done

Engineering implementation is ready when:

- `QwenLlamaCppRuntime` exists behind `AiModelRuntime`;
- `AiGateway` remains vendor-neutral;
- deterministic adapter gate passes;
- existing AI/Retrieval/Qwen/server/build regressions pass;
- docs are synchronized;
- stacked Draft PR is open against `feat/travel-qwen-runtime-evaluation-v1`.

The whole Free Local Qwen Live Evaluation V1 may be called **CLOSED** only after a real hash-verified `Qwen3-8B-Q4_K_M.gguf` executes through pinned llama.cpp and produces a live evaluation report.

Until that happens the truthful state is:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

## STOP boundary

This slice does not authorize:

- paid GPU/cloud provisioning;
- paid inference API;
- production deployment;
- production credentials;
- public llama.cpp endpoint;
- merge to `main`;
- destructive migrations;
- Trip Domain changes;
- crawler or production Knowledge ingestion;
- embedding model deployment;
- a smaller substitute model represented as Qwen3-8B qualification.
