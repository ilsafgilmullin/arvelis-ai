# Production Transport Search Contract V1

Date: 2026-09-14; qualification follow-up: 2026-09-15. Branch: `feat/travel-production-transport-search-contract-v1`.
Stacked base: Draft PR #39, `feat/travel-required-tool-routing-v1`,
qualified SHA `7308b824bbf4322a65ef768392c3c8fa2635de96`.

**Real provider network execution is NOT enabled in this slice.**

## Problem, scope and non-goals

Required Tool Routing V1 proved server-side execution before generation, but its
`{ "intent": "required-live-transport" }` argument was only an evaluation primitive.
The production tool now requires an explicit, validated domain interpretation.
It cannot turn missing places, dates or passengers into an invented query.

Scope: versioned request, validation/completeness, normalized provider port/service,
offline Yandex mapping, tool integration, evidence/freshness and regression tests.
No external transport searches, credentials, booking, payment, geocoder, currency
conversion, clarification UI, product redesign, migrations or deployments.

The earlier Trip planner `TransportSearchRequest`/`TransportProvider.searchRoutes`
remain compatible. They are a legacy, separate consumer with mandatory outbound
and return legs. They are **not** the argument to the new `transport.search` path.
No automatic conversion of a Trip's untyped traveller count into adult fares,
free-text mode hints or unspecified timezone is introduced.

## Normalized request

`src/travel/transportSearchRequest.ts`: `TransportSearchRequestV1`.
The following is a **synthetic fixture**, not a discovered route or real ticket:

```json
{
  "version": 1,
  "origin": {
    "resolution": "resolved", "type": "city",
    "rawLabel": "Synthetic Origin", "displayName": "Synthetic Origin",
    "locationId": "arvelis:synthetic-origin"
  },
  "destination": {
    "resolution": "resolved", "type": "city",
    "rawLabel": "Synthetic Destination", "displayName": "Synthetic Destination",
    "locationId": "arvelis:synthetic-destination"
  },
  "departureDate": "2026-09-21",
  "passengers": { "adults": 1 },
  "allowedModes": ["train"],
  "locale": "ru-RU",
  "timezone": "Europe/Moscow",
  "preferredCurrency": "RUB",
  "constraints": { "maxTransfers": 0 }
}
```

Required: version, origin, destination, departureDate, passengers, locale, timezone.
Optional: returnDate, allowedModes, preferredMode, preferredCurrency, constraints.
Dates are ISO calendar dates without invented times; examples expire normally.
The synthetic factory derives its date from an explicitly supplied fixture clock.

Locations are a discriminated union. Both variants have rawLabel and type
(`city | station | airport | unknown`), optional countryCode/region. Resolved
locations require displayName and a trusted `arvelis:` directory identity; type
`unknown` is forbidden. Unresolved locations cannot contain displayName/locationId.
An accepted identifier's syntax is not proof of geographic resolution: only the
trusted domain/directory boundary may assert resolution. No directory is fabricated.

Passengers are integer adults 1–9. Children/infant fare categories are not yet
part of the existing product's typed passenger model; V1 does not guess them.
Modes reuse `flight | train | bus | suburbanRail | transfer | ferry | car | other`.
Omitted allowedModes admits the selected provider's supported subset. An explicit
unsupported mode/preference is rejected, never silently removed. preferredMode is
a soft preference within allowedModes; it is not an unsupported provider parameter.

Current display locale is `ru-RU`. `timezone` is the IANA temporal context used for
the search date and local-today comparison. Departure/arrival results must carry
explicit UTC offsets; they are not locale strings. preferredCurrency is a valid
uppercase ISO currency supported by Node ICU; it never authorizes conversion.
The result retains its source currency. maxTransfers is an optional integer 0–4;
provider capabilities can reject a constraint they cannot implement.

## Validation and completeness

`validateTransportSearchRequestV1(unknown, now)` is the centralized mandatory
boundary. The model-facing JSON schema also rejects unknown properties.

- Strict objects and allowed keys at every request level; no coercion.
- No accessors, exotic prototypes, cycles, poison keys, oversized/deep objects.
  UTF-8 request budget: 8,000 bytes; location label/displayName: 160 characters;
  region: 80; timezone: 64. IDs have a bounded, provider-independent syntax.
- Missing endpoints/date/passengers/locale/timezone, impossible dates, past dates
  in the supplied timezone, return before departure, same endpoints, invalid enums,
  fractional/negative/zero/excess counts and invalid currencies fail closed.
- A valid unresolved location is representable but not executable.
  `transportSearchCompleteness` returns field-specific `unresolved_location` issues.

Natural-language interpretation belongs before this boundary. This slice does not
parse “tomorrow” or infer a departure city from a prompt. Even a complete-looking
prompt requires a corresponding server-approved domain request.

## Tool routing and provider port

`AiGatewayServerContext.transportSearchRequest` carries the interpretation of the
current user request after account/Trip authorization. Required live-transport
intent still triggers the deterministic `required-transport-search-v1` call before
generation, through AiToolRegistry. Its input is the complete normalized request.
Missing/malformed/unresolved parameters produce `AiGatewayError.transportOutcome`
with `not_executed` and typed field issues; no model generation or provider search
is used to conceal the missing information. General advice remains unaffected.

Native model calls must equal the approved domain request, independent of object
key order. They cannot substitute dates/places/passengers. Both runtime adapters
publish the structural tool schema when the gateway advertises transport.search.
The approved request is projected into runtime context only while that tool remains
available. Successful server execution with transport evidence removes only the
completed transport tool and its request from subsequent model turns. Other tools
remain available. The server validates returned calls against that turn's advertised
allowlist, held separately from the runtime's copy. Full request validation,
registry/provider execution and all normalized evidence remain server-side.
The llama.cpp adapter identity is now V4; its qualified V3 post-tool answer policy
and downstream validators remain in force. No output-rewriting fallback exists.

`NormalizedTransportProvider.search(request: TransportSearchRequestV1, context)`
accepts no raw prompt, arbitrary object or provider payload. Context contains an
already-authorized Trip ID, account scope, request ID and AbortSignal. The service
checks context shape; it does not replace repository ownership authorization.

`TransportSearchService` validates before calling the port, applies activation and
capability gates, bounds execution (default 15 s, max 120 s), propagates cancellation,
isolates provider failures and validates the existing `TransportSearchResponse`.
`registerTransportSearchTool(service)` feeds normalized evidence through the
existing registry, which prefixes IDs with the concrete tool-call ID.

Default/offline composition can register `new TransportSearchService(null)`;
complete requests then report `provider_not_configured`. There is no new HTTP route
or provider auto-activation. Existing UI and persistence/data contracts are unchanged.

## Yandex mapping and activation boundary

`yandexRaspSearchMapping.ts` is pure and has no client, key or network calls.
It maps resolved ARVELIS identities using adapter-owned trusted bindings containing
a Yandex search code and station membership. City-to-station membership must be
verified by a future directory implementation; labels alone cannot assert it.
Codes are validated before URLSearchParams serialization. Return trips reverse
the endpoints. Each supported mode produces a separate documented search request;
there is no assumed comma-list syntax, passenger tariff parameter or currency FX.

The offline response mapper supports complete, bounded, direct-service pages only.
Unmapped endpoints, missing identifiers, malformed prices, partial pagination,
interval services and unsupported transfers fail closed instead of becoming “no
results”. It reuses the existing route mapper and normalized result validator.
Yandex tickets_info becomes `cached_observation`, availability remains unknown,
and no validUntil is manufactured. City/station binding is retained in normalized
locations. A fixture using this mapper still carries synthetic provenance.

Official documents checked on 2026-09-14:

- [Search reference](https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point):
  from/to, date, transport_types, result_timezone, transfers and pagination;
  mode mapping plane/train/suburban/bus/water. Helicopter is not separately modeled.
- [API access](https://yandex.ru/dev/rasp/doc/ru/concepts/access): a configured key is
  required for real requests. This slice supplies none.
- [Provider terms](https://yandex.ru/legal/rasp_api/?lang=ru): free public access,
  attribution requirements differentiated by platform, temporary caching restriction.

Numeric quota is not claimed verified by these pages; account quota confirmation
remains an activation blocker. No terms acceptance is inferred from reading docs.
Existing terms recency, free_public, credentials, quota and strategy gates remain.
Explicit attributionImplemented and operationalPolicyAccepted gates are added,
defaulting closed. The legacy live factory also requires corresponding environment
flags; `.env.example` sets both false. Real attribution implementation/platform
review remains a production prerequisite. Synthetic activation is explicitly
test-only and never marks the Yandex live factory ready.

## Results, evidence, freshness and errors

The existing normalized route/segment/price contracts and validator remain mandatory.
The new service additionally checks strict normalized keys, provider/request/leg
correlation, trusted endpoint identities, requested date, supported modes, transfer
bounds, explicit timestamp offsets, real currency and future retrieval timestamps.
Budget: 256 KB result, at most 20 routes and at most 60 derived evidence items;
individual evidence text remains limited to 4,000 characters.

Provider evidence includes retrievedAt, optional expiresAt, source URL/provider,
domain, normalized content, and provenance `{requestId, routeId, providerRouteId,
dataKind}`. The existing registry creates final IDs
`tool:<execution-id>:route-<index>-<domain>`; models cannot invent IDs. Current
price requires a quoted request-total price and a bounded current validity interval.
`from`, cached observations and unknown semantics never become authoritative prices
on this new path. Unbounded freshness is unknown, expired stays expired. A supplied
interval exceeding 15 minutes is rejected; no provider TTL is synthesized. Evidence
expiry is rechecked after generation before protected-fact validation.

Service outcomes distinguish `results`, `no_results`, `not_executed`, `failed`.
Errors include invalid_search_request, missing_required_parameter,
unsupported_transport_mode, unresolved_location, unsupported_constraint,
provider_not_configured, provider_unavailable, provider_timeout, aborted,
access_denied and malformed_provider_response. The Gateway preserves typed
transport outcomes, including genuine no_results, without asking the model to
claim “no departures” after a provider failure. Internal causes/credentials are not
returned as provider error messages. Existing gateway audit and rejection behavior
remain; toolCallsExecuted counts successful registry executions, not all attempted
network requests. Provider request IDs/provenance correlate completed results.

## Verification and release evidence

`npm run test:transport-search-contract` covers one-way/round-trip requests,
29 invalid request variants, local-date boundaries, unresolved locations,
provider inactivity/activation prerequisites, capability mismatch, failure,
timeout, pre/in-flight cancellation, valid/malformed/no-results/stale results,
currency/price semantics, provenance, native parameter invention, deterministic
routing, missing parameters, expiry during model generation, and Yandex fixtures.

Existing plan/transport/provider/map/legal, AI Knowledge/retrieval, Qwen/runtime/
Required Tool Routing, Yandex loopback HTTP and Trip persistence/ownership smoke
tests were run locally and passed. Typecheck, server build and frontend build
passed. Full local `npm run check` reached browser acceptance and stopped because
this workstation has no Chrome/Chromium; that is not reported as a local full-check
pass. Exact-head GitHub CI runs browser acceptance, full npm check, migrations,
PostgreSQL Trip ownership and pgvector isolation; its run IDs/conclusions are
recorded in the Draft PR description, the release evidence for the actual HEAD.

The live Qwen harness keeps all golden/semantic/security gates and synthetic price
fixtures. Its requests use the same strict contract, not a special-case intent.
Per-attempt timestamps derive from an explicit fixture instant; current evidence
expires after five minutes, stale evidence expired five minutes before the instant.
No hardcoded future freshness date is used. The semantic review configuration is
unchanged from #39. Inherited booleans do not prove new transcripts: any new live
qualification claim requires downloading and manually reviewing that run's artifact.

## Timeout regression and selective runtime projection

Run #12 ([34819671925](https://github.com/ilsafgilmullin/arvelis-ai/actions/runs/34819671925))
at `1865c5caee89d77c0a47a18f6c8cbf7b5db73434` completed its workflow successfully
but was **NOT_QUALIFIED**: 28 attempts, two timeouts, normal run 1 failed,
normal runs 2/3 and reproducibility passed. Structured/protected policy rates were
100%, protected violations zero, required routing 4/4 + 4/4. CI runs 34819671921
and 34819676162 passed; CI success did not qualify the live model.

The forensic comparison with qualified run #10 (34778247895) confirmed redundant
post-tool input, not evidence inflation or an extra model turn. For the price case
in normal run 2, actual captured requests and llama.cpp timings were:

| Metric | #10 | #12 |
| --- | ---: | ---: |
| HTTP request body, UTF-8 bytes | 5,023 | 8,448 |
| Transport parameter schema, bytes | 45 | 2,848 |
| Tools array, bytes | 269 | 3,072 |
| Runtime context, bytes | 491 | 1,037 |
| Executed request within context, bytes | 0 | 520 |
| Model-facing evidence array, bytes | 336 | 336 |
| Prompt tokens | 812 | 1,946 |
| Completion tokens | 93 | 93 |
| Prompt evaluation, seconds | 34.059 | 51.456 |
| Generation, seconds | 15.178 | 17.657 |
| Runtime exchange, seconds | 49.267 | 69.159 |
| Overall attempt p50 / p95 / max, seconds | 45.597 / 55.723 / 74.378 | 60.391 / 90.005 / 90.011 |
| Timeouts | 0 | 2 |

87.46% of this pair's added latency was prompt evaluation. The full production
schema added 1,002 prompt tokens and the redundant request another 132. Even cases
without a connected transport tool received that extra request. Median generation
speed changed from 6.60 to 6.42 tokens/s; this alone does not explain the regression.
Model GGUF hash, pinned llama.cpp revision, CPU strategy, context size, sampling,
output budget and timeout limits were the same.

- Primary timeout: `live-normal-1-tool_backed_price_can_be_authoritative`, llama
  task 270. Slot launch at server-log time 106.786 s, cancellation at 196.790 s,
  release at 272.394 s. The larger prompt occupied the slot through the deadline.
- Cascade timeout: `live-normal-1-knowledge_only_legal_fails_closed`, task 273.
  It waited approximately 75.6 s for the single slot, launched at 272.435 s,
  cancelled at 286.819 s and released at 299.508 s. Only about 14.4 s of its
  90 s budget remained for computation. The pinned server processes cancellation
  after its synchronous decode work yields; client abort is not instant slot release.
- Timed-out HTTP exchanges were not recorded by the old response-only recorder.
  Their completion-token count, first-token time and prompt/generation split are
  unavailable; terminal prompt counters are not completion-token measurements.

The fix is a selective `AiGateway` projection, shared by runtime adapters. After a
successful transport execution supplies evidence, the model receives that complete
existing evidence but no repeated transport schema or executed request. Evidence
freshness may be expired; hiding the completed action does not promote stale facts.
Without evidence, the completed-with-evidence state is not entered. Unexecuted,
connected transport retains its approved request. Turns without a transport tool
omit an unusable request. Native calls use the same server-owned turn allowlist;
a custom runtime cannot restore transport availability by mutating its input.

The full Production Transport Search Contract, provider service/mapping, lockfile,
model adapter, generation policy, evidence serialization, validators and golden
configuration are unchanged. No retry or extra generation is added. Runtime timeout
stays 90 s; the live harness gateway budget stays 120 s. Cancellation and the
post-generation evidence expiry check are unchanged. The response-only timeout
telemetry gap remains a documented operational limitation; it is not hidden by a
synthetic success record or an evaluator exception.

Regression coverage now includes full server input, complete evidence/provenance,
selective tool availability across turns, rejected repeated calls (including runtime
allowlist mutation), no-tool/unexecuted paths, empty evidence and no extra turns.
An integration smoke exercises Gateway through the real llama.cpp serializer with
a synthetic price fixture: no production schema/request in the HTTP body, preserved
evidence, deterministic serialization and a body smaller than 5 KB. Existing
incomplete-request, stale rejection and expiry-during-generation tests remain.
The incomplete-request regression also explicitly checks the provider call count.

The live workflow now also watches this document, so a release-evidence commit
triggers qualification of its actual HEAD. Runner, model and evaluation settings
are unchanged. Post-fix live performance and semantic conclusions require raw
artifact review; they are not inferred from the deterministic payload bound.

### First controlled post-fix live evidence

[Live #13 / 34925855242](https://github.com/ilsafgilmullin/arvelis-ai/actions/runs/34925855242)
tested fix SHA `61ad359b17df7896407ea39883534ced20a88386` on a clean four-core
free CPU runner, with the same pinned model/llama.cpp and no transport-prefix
warm-up. Workflow SUCCESS; evaluation **QUALIFIED**. Artifact `10380456262` was
downloaded and unpacked; its locally verified SHA-256 is
`de780b65c26eff78d6596eb719c2809742ea0fe6e1b5217666809f378c498433`.

All 28 exchanges and all 28 llama slot requests are present, with one model turn
per attempt, no native tool-call responses and no cancellations. All three normal
golden runs and the reproducibility run PASS; structured validation and protected
policy are 100%, violations zero, timeouts zero. Required routing is price 4/4,
prose/claims 4/4 and stale 4/4. Model and llama.cpp hashes match #12 exactly.

Manual semantic review inspected all eight current target messages, claims and
actual runtime evidence, not just the inherited semantic-review booleans:

| Profile | Price case | Prose/claims case |
| --- | --- | --- |
| normal 1 | PASS: message `12345 RUB`, matching price fact | PASS: explicitly synthetic `12345 РУБ` in message and claim |
| normal 2 | PASS: message `12345 RUB`, matching price fact | PASS: explicitly synthetic `12345 РУБ` in message and claim |
| normal 3 | PASS: message `12345 RUB`, matching price fact | PASS: explicitly synthetic `12345 РУБ` in message and claim |
| reproducible 1 | PASS: message `12345 RUB`, matching price fact | PASS: explicitly synthetic `12345 РУБ` in message and claim |

Every target claim uses mode `fact`, domain `price`, and exact existing evidence
ID `tool:required-transport-search-v1:synthetic-price-current`. Supplied evidence
is current and provider-origin, with the same text, source identity and retrieval
instant as before projection. Each response finishes within the fixture's five-minute
freshness window. No target narrates or simulates the completed tool call or invents
an ID/call. These are synthetic evaluation prices, never discovered real tickets.

All four stale messages decline to confirm a current price, but still include
historical price fact claims referencing expired evidence. The unchanged gateway
rejects all four with `protected_fact_requires_tool_evidence`. A replay of the
existing structured/evidence validator against all 28 raw responses confirms these
four rejections and four knowledge-only legal rejections. They account for report
errorCount 8; none is a timeout or an accepted protected-fact violation. This is
fail-closed validation, not a claim that every raw stale answer is acceptable.

| Measured metric | Before: #12 | After: #13 |
| --- | ---: | ---: |
| Price normal 2 request body, bytes | 8,448 | 4,718 |
| Transport schema / tools array sent, bytes | 2,848 / 3,072 | 0 / 0 (absent) |
| Runtime context / executed request, bytes | 1,037 / 520 | 491 / 0 |
| Evidence array, bytes | 336 | 336 |
| Prompt / completion tokens | 1,946 / 93 | 678 / 93 |
| Prompt evaluation, seconds | 51.456 | 47.877 |
| Generation, seconds | 17.657 | 14.474 |
| Runtime exchange, seconds | 69.159 | 62.370 |
| Overall attempt p50, seconds | 60.391 | 44.845 |
| Overall attempt p95, seconds | 90.005 | 63.125 |
| Overall attempt max, seconds | 90.011 | 63.554 |
| Timeouts | 2 | 0 |
| Median generation tokens/s | 6.42 | 6.50 |

Cold first price attempt: task 280, 678 prompt / 93 completion tokens, cached prefix
97 tokens, prompt evaluation 48.341 s, generation 14.753 s, runtime 63.121 s.
It releases the slot normally; the following legal request does not cascade into
a timeout. The runtime adapter remains at its 90 s deadline. Normal run 2 also has
only 97 cached tokens (581 processed), versus #12's 1,409 cached / 537 processed.
Thus the warm-pair latency change must not be described as proportional to total
prompt-token reduction. All four price attempts in #13 use this small 97-token
common prefix; later successful price runs do not rely on a warmed transport schema.

[Push CI 34925855173](https://github.com/ilsafgilmullin/arvelis-ai/actions/runs/34925855173)
and [PR CI 34925857902](https://github.com/ilsafgilmullin/arvelis-ai/actions/runs/34925857902)
are SUCCESS: validate, full npm check, browser happy-path, both builds, all smoke
suites; PR CI also passes PostgreSQL migrations/Trip ownership and pgvector
isolation/retrieval. PR test merge `94c631d6af1a29d22b68afa45fed116c6ed9a391`
has exactly the fix HEAD tree `31341ed27045a72761a1d5dab175046a317c4fb1`.

This evidence-documentation commit changes no executable code. It intentionally
triggers a second independent clean-start live evaluation and CI for its new HEAD.
The final repeat's run IDs, actual HEAD, raw review and conclusions are maintained
in the [PR #40 release description](https://github.com/ilsafgilmullin/arvelis-ai/pull/40),
so recording them does not create another untested source commit. Completion still
requires that final exact-head repeat to qualify with timeout zero and an 8/8 manual
review; the first controlled run alone does not establish stability.

## Production blockers and next slice

Remaining by design: trusted location directory/membership, application-level
interpretation/clarification, complete provider pagination/interval handling,
verified operating quota and platform attribution, accepted operational policy,
and separately authorized credentials/network activation. Exact passenger pricing
needs a provider guarantee, not inference from schedule ticket observations.

Next slice: trusted location resolution and normalized Yandex provider integration
behind these gates, with offline fixtures first and explicit authorization before
real credentials or network execution. PR #39 and this stacked PR stay Draft/Open;
neither is merged or deployed by this slice.
