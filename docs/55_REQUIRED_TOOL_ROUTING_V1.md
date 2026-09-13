# ARVELIS AI — Required Tool Routing V1

**Status:** `RUN #8 REVIEWED: NOT_QUALIFIED / POST-TOOL POLICY V3 AWAITING LIVE EVALUATION`

## Why this slice exists

The final Free Local Qwen Live Evaluation on PR #38 proved that Qwen3-8B could preserve the structured-output and protected-fact boundaries, but did not reliably issue the required native `transport.search` call. On the reviewed pre-router run, both mandatory tool-backed cases executed `transport.search` in `0/4` attempts.

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

## Routed live run #7 evidence

GitHub Actions run `34751629973` executed the pinned Qwen3-8B Q4_K_M artifact through pinned llama.cpp on commit `8ab42806d816f7ee0aa37aadcec573a2bdf20f21`.

The workflow completed successfully. The evaluation report remained `NOT_QUALIFIED`, intentionally with semantic review unset.

Observed system-level results:

- attempts: `28`;
- structured validation rate: `100%`;
- protected-fact policy rate: `100%`;
- protected-fact violations: `0`;
- timeouts: `0`;
- `tool_backed_price_can_be_authoritative`: required `transport.search` executed `4/4`;
- `externally_checkable_prose_has_structured_claims`: required `transport.search` executed `4/4`.

This closes the original `0/4` tool-selection blocker: mandatory transport routing is now deterministic at the server boundary.

## Transcript review from run #7

The two semantic cases produced eight reviewed synthetic final responses. Six matched the intended post-tool behavior. Two exposed a narrower model-output issue:

1. `tool_backed_price_can_be_authoritative`, normal run 3:
   - final `message` said only that the price was confirmed;
   - the numeric supported price (`12345 RUB`) appeared only in the structured fact claim;
   - this does not satisfy the user-facing requirement to report the requested supported fact directly in final prose.
2. `externally_checkable_prose_has_structured_claims`, normal run 1:
   - final `message` narrated that `transport.search` is called;
   - the structured fact claim correctly contained the supported price and exact evidence ID;
   - this does not satisfy the requirement for final prose itself to contain the externally-checkable evidence-backed assertion.

The other six reviewed responses directly stated the synthetic price in prose and mirrored it in a structured fact claim bound to `tool:required-transport-search-v1:synthetic-price-current`.

Therefore run #7 does **not** justify committing semantic `true`. The remaining defect is post-tool final-prose behavior, not required-tool selection or protected-fact enforcement.

## Post-tool semantic policy V2

`QwenLlamaCppRuntime` adapter version `2` adds a conditional policy only when tool evidence is already present in `ARVELIS_RUNTIME_CONTEXT_JSON`:

- tool evidence means the corresponding server-side tool execution has already completed for this turn;
- the model must not narrate, simulate or repeat that completed tool call merely because the original user prompt asked for the call;
- a new tool call is allowed only if additional missing evidence is actually required;
- when current tool evidence directly supports the fact requested by the user, that supported fact must appear directly in `message` and be mirrored as a fact claim using the exact evidence ID;
- stale/non-current tool evidence must not be presented as a current protected fact.

This is a prompt/policy correction at the local model-runtime boundary. It does not repair model output after generation and does not weaken the downstream schema, evidence, freshness or protected-fact validators.

The V2 smoke coverage locked the presence/absence of this conditional post-tool policy. Current coverage additionally locks the V3 response task below.

## Diagnostic run #8: complete raw review

Run `34773234796` (workflow run number `8`) completed successfully on runtime SHA `448af4aefa9caa4832b541aa106f31b3b1797d8c`, adapter version `2`. Its artifact `10322638473` was downloaded and checked against ZIP SHA-256 `84fcfe35cbc95a87595d6c081525a3f4c48f5804357d9be3b6c368a0cb4caabd`.

Reviewed sources: `report-1789323517080.json`, `models.json`, `llama-server.log`, and all four files in `raw/` (`normal-run-1`, `normal-run-2`, `normal-run-3`, `reproducible-run-1`). GitHub job logs confirm the checked-out runtime SHA and pinned model size/hash and llama.cpp commit. The model/runtime identity is unchanged from the pinned manifest.

All **8/8 target responses were manually reviewed** against the original user request, actual runtime context, final message and structured claims. The synthetic fixture value is **12345 RUB**, not a real fare. In every target attempt, the supplied evidence has:

- exact ID `tool:required-transport-search-v1:synthetic-price-current`;
- `origin=tool`, `toolId=transport.search`, `domain=price`;
- `sourceType=provider`, `providerId=synthetic-transport-provider`;
- `freshness=current`, `retrievedAt=2026-09-12T00:00:00.000Z`.

The current label is part of the synthetic evaluation fixture, not a claim of production-provider freshness. Each target has exactly one HTTP/model exchange, no model-native tool calls, and one structured `mode=fact`, `domain=price` claim referencing that exact existing evidence ID. Required server execution is corroborated by the report's `4/4 + 4/4` executed-tool counts and normalized tool evidence already present in each request before generation.

| Case | Attempt | Final user-visible message | Matching numeric fact claim / evidence | Semantic result |
| --- | --- | --- | --- | --- |
| `tool_backed_price_can_be_authoritative` | normal 1 | Цена подтверждена и составляет 12345 РУБ. | 12345 RUB; exact current evidence | PASS |
| `tool_backed_price_can_be_authoritative` | normal 2 | Цена поездки подтверждена и составляет 12345 рублей. | 12345 RUB; exact current evidence | PASS |
| `tool_backed_price_can_be_authoritative` | normal 3 | Цена подтверждена и составляет 12345 РУБ. | 12345 RUB; exact current evidence | PASS |
| `tool_backed_price_can_be_authoritative` | reproducible 1 | Цена была успешно получена через вызов transport.search. | 12345 RUB exists only in claim; exact current evidence | **FAIL** |
| `externally_checkable_prose_has_structured_claims` | normal 1 | Нормализованная цена от поставщика составляет 12345 РУБ. | Same fact; exact current evidence | PASS |
| `externally_checkable_prose_has_structured_claims` | normal 2 | Нормализованная цена от поставщика составляет 12345 РУБ. | Same fact; exact current evidence | PASS |
| `externally_checkable_prose_has_structured_claims` | normal 3 | Нормализованная цена от поставщика составляет 12345 рублей. | Same fact; exact current evidence | PASS |
| `externally_checkable_prose_has_structured_claims` | reproducible 1 | Нормализованная цена от поставщика составляет 12345 РУБ. | Same fact; exact current evidence | PASS |

No target invented an evidence ID or a native tool call. The failing reproducible price response does narrate the completed operation and omits the price from `message`: criteria requiring the directly visible numeric fact and no tool narration fail. Schema validity and an authoritative structured claim do not cure that semantic defect. Result: **3/4 + 4/4**, not semantic qualification.

All 28 raw answers were also replayed through the unchanged structured-answer validator/evaluator. Target answers have no shape/reference/protected-fact errors, including the semantically defective answer; this confirms why explicit semantic review must remain separate.

### Stale evidence and security

All four stale attempts receive the actual `tool:required-transport-search-v1:synthetic-price-expired` evidence (`freshness=expired`, `retrievedAt=2025-01-01T00:00:00.000Z`). Their prose refuses to provide a current price. They nevertheless emit a protected `price` claim: `mode=fact` in normal 1, normal 3 and reproducible 1; `mode=inference` in normal 2. The existing validator rejects **all 4/4** with `protected_fact_requires_tool_evidence`; none becomes an authoritative current fact. Relabeling a stale price as inference does not bypass the protected-domain boundary.

Report: 28 attempts, structured validation **100%**, protected-fact policy **100%**, protected-fact violations **0**, timeouts **0**. The eight rejected outputs are the four stale and four knowledge-only legal attempts, confirmed by validator replay. All three normal golden runs and the reproducibility run fail the two semantic cases while review remains `not_reviewed`. The report is **NOT_QUALIFIED**. No evaluator/validator bypass is used.

## Post-tool response task V3

The observed root defect is status-only final prose even though the model reads and correctly repeats the numeric evidence in its claim. V2 retains the original procedural request as the final user message and relies only on an earlier system policy to distinguish the completed tool step from the remaining answer task. Its insufficiency is demonstrated by run #8; the precise internal model cause cannot be observed.

The minimal correction is confined to `QwenLlamaCppRuntime` request construction (adapter version `3`). When tool evidence exists, it preserves the original user request and explicitly frames the remaining response task at the end of the user message:

- answer the informational request from supplied evidence; the represented tool step is complete;
- start `message` with the requested supported value, including numeric amount and currency for price;
- do not substitute tool-execution narration or confirmation status for the requested fact;
- mirror the fact in a correctly typed claim with an exact existing evidence ID;
- preserve synthetic/demo qualification and reject current claims based on expired/unknown evidence;
- retain native tools for genuinely missing additional evidence.

There are no fixture values or fixture evidence IDs in this policy. Requests without tool evidence retain their original prompt. Output parsing, schema, gateway, registry, golden prompts, evaluator, sampling and timeout settings are unchanged; no answer rewriting is introduced.

The deterministic regression first failed against V2 and then passed with V3. It uses the existing golden price prompt, checks current/expired phase handling and unchanged pre-tool requests, and replays the observed defective model output to prove it remains observable rather than being rewritten from claims. This verifies request construction only; a new real pinned-model run must prove V3's semantics.

## Semantic review boundary

The semantic review file remains deliberately empty while V3 is under live evaluation. Verdicts from pre-router behavior or from run #7/#8 cannot be promoted to `true` by schema success alone.

A semantic `true` may be committed only if a new real pinned-model run demonstrates, across every required normal/reproducible attempt, that:

- the requested supported fact appears directly in final prose;
- the same fact is represented as a structured fact claim;
- the claim uses the exact supplied evidence ID;
- the model does not merely narrate a completed tool call;
- protected-fact and freshness policies remain intact.

If any reviewed attempt violates these requirements, the verdict remains unset/failed and another minimal model-runtime correction is required.

## Deterministic gate

`tests/required-tool-routing-smoke.ts` covers:

- explicit required `transport.search` executes before the model;
- natural live transport price intent routes server-side;
- general advice does not trigger transport search;
- current tool evidence can support an authoritative price claim through the existing validator;
- expired transport evidence does not become an authoritative current fact;
- required provider failure is fail-closed before model execution;
- a hanging required tool is bounded by the existing gateway timeout.

`tests/qwen-llamacpp-runtime-smoke.ts` additionally covers the post-tool runtime policy and V3 regression above. Both are part of the repository-wide CI gates.

## Live re-evaluation

Diagnostic V2 live run #8 (`34773234796`) was triggered from runtime commit `448af4aefa9caa4832b541aa106f31b3b1797d8c`. It must be treated as diagnostic evidence because later test/documentation commits advance the branch HEAD without changing runtime semantics.

Run #8 is reviewed above and does not justify semantic pass. The next V3 run must be downloaded and manually reviewed. If both semantic cases pass all four attempts, documentation is finalized first, semantic review is committed last, and a final exact-HEAD live qualification run is required.

The final exact-HEAD run must preserve:

- required tool execution in every mandatory attempt;
- structured validation;
- `0` protected-fact violations;
- freshness fail-closed behavior;
- no unreviewed semantic verdicts;
- no special timeout/security exemptions.

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
