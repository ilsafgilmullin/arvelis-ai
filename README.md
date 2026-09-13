# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider/runtime quotas и cost controls остаются backend policy.

## Closed AI foundations

- `Retrieval & Knowledge Ingestion Foundation V1` — Draft PR #36, PostgreSQL 18 + pgvector, strict Global/account isolation, additive migration `003`, green final checkpoint.
- `Qwen Runtime Adapter & AI Evaluation V1` — Draft PR #37, final HEAD `b5685472efdaaea57e674911a852f0bf9bf7aa78`, production-oriented `QwenVllmRuntime` adapter and deterministic golden-evaluation foundation, green final checkpoint.

No production model has been deployed by either slice.

## Current slice — Free Local Qwen Live Evaluation V1

Branch:

`feat/travel-free-local-qwen-live-evaluation-v1`

Base:

`feat/travel-qwen-runtime-evaluation-v1` / Draft PR #37.

Current truthful state:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`

The goal is a first **free real-model qualification path** without rented GPU, paid inference API or production infrastructure:

`AiGateway → AiModelRuntime → QwenLlamaCppRuntime → local llama.cpp → Qwen3-8B GGUF`.

This does **not** replace the future production-oriented path:

`AiGateway → AiModelRuntime → QwenVllmRuntime → vLLM`.

`AiGateway` remains vendor-neutral.

## Pinned local evaluation artifacts

Model manifest: `config/qwen-local-live-model-manifest.v1.json`.

- repo: `Qwen/Qwen3-8B-GGUF`;
- immutable revision: `7c41481f57cb95916b40956ab2f0b139b296d974`;
- GGUF: `Qwen3-8B-Q4_K_M.gguf`;
- quantization: `Q4_K_M`;
- file size: `5,027,783,488` bytes;
- expected SHA-256: `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785`;
- license: Apache-2.0;
- local model alias: `arvelis-qwen3-8b-q4-k-m-v1`.

Pinned llama.cpp:

- release: `b10902`;
- commit: `df03399b885831b2a1603b3abb0d8c156808e363`.

GGUF and local evaluation transcripts are never committed. `.gitignore` excludes `.local-models/`, `.local-eval/` and `*.gguf`.

Q4_K_M evaluation is not equivalent to the future BF16/vLLM baseline.

## QwenLlamaCppRuntime

`server/travel/runtimes/qwenLlamaCppRuntime.ts` implements the existing `AiModelRuntime` for development/evaluation only.

Security/runtime properties:

- accepts only HTTP loopback `127.0.0.1`, `localhost`, `::1`;
- exact OpenAI-compatible `/v1` base path;
- no remote HTTP/HTTPS target;
- no credentials/query/fragment in URL;
- `POST /v1/chat/completions`;
- system/user messages;
- current ARVELIS tool descriptors and `tool_choice`;
- strict `response_format.type=json_schema`;
- Qwen3 non-thinking request metadata;
- caller cancellation;
- bounded adapter timeout;
- bounded response body;
- strict JSON/choice/message parsing;
- unknown/unavailable/malformed tool calls fail closed;
- free-form final answer fails closed;
- no heuristic repair;
- existing `validateAiModelTurn` remains mandatory.

Normal sampling uses `temperature=0.7`, `top_p=0.8`, `top_k=20`. The reproducibility profile uses temperature `0`, `top_p=1`, `top_k=1`, fixed seed `424242`.

## Golden live evaluation

There is no second evaluation framework.

`server/travel/qwenLocalLiveEvaluation.ts` reuses:

- `QWEN_GOLDEN_CASES`;
- `runQwenGoldenEvaluation()`;
- real `AiGateway`;
- real `QwenLlamaCppRuntime`;
- deterministic synthetic retrieval/tool fixtures.

The golden set covers general inference, unsupported price, current tool-backed price, Knowledge-only Legal, stale protected evidence, unknown tool and externally-checkable prose coverage.

Schema PASS, protected-fact policy PASS and semantic coverage PASS are separate signals. `semanticCoveragePassed=true` is never inferred automatically from JSON validity. Missing review means final qualification is `NOT_QUALIFIED`.

Raw model exchanges are stored only under gitignored `.local-eval/qwen/raw/`. Sanitized report excludes credentials, real account IDs, private Trip data and real user prompts.

## Explicit preflight and live command

Nothing heavy runs from Replit, `npm ci` or `npm run dev`.

On a suitable free local machine:

```bash
npm ci
npm run eval:qwen-local-live -- --preflight
```

Only after preflight passes should an operator acquire the exact pinned GGUF, verify its SHA-256, start the pinned `llama-server` on loopback with `--jinja`, `--reasoning off` and bounded context, then run:

```bash
npm run eval:qwen-local-live -- --run
```

Detailed commands and security rules are in `docs/54_FREE_LOCAL_QWEN_LIVE_EVALUATION_V1.md`.

The current free execution environment inspected during this slice has about 5.8 GiB total RAM, no swap and no `llama-server`. That is below the manifest requirements, so the 5+ GB GGUF was **not downloaded** and Qwen3-8B was **not executed**. No smaller model was substituted.

## Deterministic verification

Main local adapter gate:

```bash
npm run test:qwen-llamacpp-runtime
```

It uses a loopback fake HTTP server and does not require GGUF. It also compile-checks the live-evaluation runner and syntax-checks its explicit CLI.

Full engineering checkpoint:

```bash
npm run check
```

Implementation push run #733 on HEAD `a959d8b46c0922cc1359026301ec5681f976dffb` passed typecheck, lower-layer regressions, existing Qwen evaluation, the new llama.cpp adapter gate, server build, server-backed browser happy-path and frontend build.

## Replit boundary

`.replit` is intentionally unchanged. Replit remains an ordinary ARVELIS web/backend development environment and is not a model host.

No automatic model download, llama.cpp build/startup, GPU/CUDA setup or large model cache is attached to Replit/npm lifecycle commands.

## STOP / DoD boundary

Engineering DoD requires the adapter, deterministic gate, existing regressions, synchronized docs and a stacked Draft PR against `feat/travel-qwen-runtime-evaluation-v1`.

The whole Free Local Qwen Live Evaluation V1 is **not CLOSED** until the exact hash-verified Qwen3-8B Q4_K_M artifact actually runs through pinned llama.cpp and produces the sanitized live report.

Until suitable free compute exists, the state remains:

`ENGINEERING READY / LIVE MODEL NOT EXECUTED / BLOCKED BY FREE COMPUTE`.

Not authorized: paid GPU/cloud, paid inference API, production model/runtime, production credentials, public llama.cpp endpoint, merge to `main`, destructive migration, Trip Domain changes, crawler/production Knowledge ingestion or embedding deployment.

See `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/07_DECISIONS.md`, `docs/53_QWEN_RUNTIME_ADAPTER_AI_EVALUATION_V1.md`, `docs/54_FREE_LOCAL_QWEN_LIVE_EVALUATION_V1.md`.
