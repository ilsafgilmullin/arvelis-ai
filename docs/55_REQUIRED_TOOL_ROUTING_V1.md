# ARVELIS AI — Required Tool Routing V1

**Status:** `IMPLEMENTED / DETERMINISTIC CI PENDING / LIVE RE-EVALUATION REQUIRED`

## Why this slice exists

The final Free Local Qwen Live Evaluation on PR #38 proved that Qwen3-8B could preserve the structured-output and protected-fact boundaries, but did not reliably issue the required native `transport.search` call. On the reviewed current-behavior run, both mandatory tool-backed cases executed `transport.search` in `0/4` attempts.

This slice moves mandatory live-transport tool selection out of probabilistic model behavior and into the server-side `AiGateway` orchestration boundary. It does **not** weaken any structured-answer, evidence, protected-fact, timeout or semantic-coverage gate.

## Routing policy

`AiGateway` requires a server-side `transport.search` execution before the model runs when all of the following are true:

1. request scope is `trip`;
2. `transport.search` is actually connected in `AiToolRegistry`;
3. no `transport.search` tool evidence has already been collected for the request;
4. the request either explicitly requires `transport.search`, or asks for a live transport fact using both:
   - transport context (`ticket/train/plane/bus/electric train/flight/transport` in Russian wording used by the product), and
   - protected live-fact intent such as price, cost, schedule, departure/arrival, availability or free seats.

The deterministic call ID is `required-transport-search-v1`. V1 passes the bounded input `{ "intent": "required-live-transport" }` to the registered handler.

The existing `AiToolRegistry` remains authoritative for:

- whether the tool is connected;
- Trip authorization requirement;
- tool input/output shape bounds;
- allowed evidence domains;
- evidence normalization;
- source/freshness validation;
- provider failures.

The existing `AiGateway` timeout/cancellation controller also covers the required server-side tool execution. A required provider failure becomes `tool_failure`; a hanging required tool remains bounded by the gateway timeout. The model is not allowed to run after either failure.

## Protected-fact boundary

Server-side routing only guarantees that a required tool is executed. It does not make model prose authoritative by itself.

A protected transport claim is still accepted only when the existing answer validator/evaluator can trace it to valid `transport.search` evidence with acceptable freshness. Expired evidence remains non-authoritative, and missing/wrong evidence remains fail-closed.

## Semantic review boundary

The semantic review file is deliberately reset on this branch. Verdicts recorded for the pre-router behavior in PR #38 cannot be reused for changed behavior.

A new `true` or `false` semantic verdict may be committed only after the real pinned Qwen3-8B synthetic transcripts from this branch are inspected. Schema success or tool execution alone is not sufficient.

## Deterministic gate

`tests/required-tool-routing-smoke.ts` covers:

- explicit required `transport.search` executes before the model;
- natural live transport price intent routes server-side;
- general advice does not trigger transport search;
- current tool evidence can support an authoritative price claim through the existing validator;
- expired transport evidence does not become an authoritative current fact;
- required provider failure is fail-closed before model execution;
- a hanging required tool is bounded by the existing gateway timeout.

The smoke test is part of `npm run test:qwen-runtime-evaluation`, which is already part of the repository-wide `npm run check` gate.

## Live re-evaluation

The same pinned model, GGUF hash, pinned llama.cpp build, sampling profiles and golden suite from PR #38 must be rerun. The first routed run intentionally starts with semantic cases as `not_reviewed`.

Expected system-level evidence before any semantic verdict is recorded:

- mandatory current transport cases execute `transport.search` in every attempt;
- stale transport case also executes the tool but stays fail-closed for current facts;
- protected-fact violations remain `0`;
- structured validation remains intact;
- timeout behavior is reported without special exemptions;
- raw synthetic transcripts show that Qwen grounds externally-checkable prose in the supplied tool evidence.

Only after transcript review may semantic verdicts be recorded and a final exact-head live qualification rerun.

## Scope intentionally not expanded

This slice does not add or authorize:

- paid inference or paid compute;
- production deployment;
- production credentials;
- merge to `main`;
- destructive data changes;
- public model endpoints;
- provider activation beyond the existing synthetic evaluation fixture;
- weakening or bypassing evaluation/security gates.

V1 also does not claim that the generic `{ intent: "required-live-transport" }` input is a production provider query contract. Production transport execution still needs a separately validated normalized origin/destination/date/passenger request at the provider adapter boundary.
