# Yandex Rasp Live Provider Integration V1

Review date: 2026-09-15. Stacked on PR #40, exact qualified base
`a4c5cfa3ebce8a1762fec3046da514df4f532fc9`.

**Production activation is NOT part of this slice.**

## Scope and achieved levels

This slice implements the secure read-only normalized provider path and offline
integration tests. It does not configure a real credential, deploy, book tickets,
add geocoding, change UI, or alter the qualified Qwen runtime/projection.

- `IMPLEMENTATION_COMPLETE`: requires green exact-head CI; final run IDs and HEAD
  are recorded in the Draft PR description after CI completes.
- `LIVE_PROVIDER_VERIFIED`: **not achieved — BLOCKED_BY_CREDENTIAL**.
- `END_TO_END_VERIFIED`: **not achieved** for real Yandex data and real Qwen.
- `PRODUCTION_ACTIVATED`: **not performed**, independent approval/UI gates remain.

The available environment reports credential **not configured**. Offline tests use
an explicitly fake credential and fabricated provider-shaped fixtures, not tickets.

## Official documentation and terms reviewed

- [API/search](https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point):
  recommended HTTPS host `api.rasp.yandex-net.ru`, v3.0 `/search/`; date-only ISO
  input, documented mode mappings, `transfers=false`, offset/limit pagination,
  maximum 100 records per page. Offset-aware timestamps are preserved.
- [Access](https://yandex.ru/dev/rasp/doc/ru/concepts/access): each request requires
  a key; Authorization is supported. This implementation never uses query apikey.
- [Coding systems](https://yandex.ru/dev/rasp/doc/ru/concepts/coding-system):
  adapter-owned Yandex bindings are separate from ARVELIS location IDs.
- [Errors](https://yandex.ru/dev/rasp/doc/ru/concepts/error-codes): 400 denotes an
  invalid query, 404 an unknown object. Error bodies may include request URLs;
  they are never forwarded, logged or retained.
- [Terms](https://yandex.ru/legal/timetable_api/ru/): free, publicly accessible
  products only; registration itself is allowed. Attribution is required in
  product/help/site descriptions and immediately above/below data on every relevant
  screen, with an active link and text at least the main font size, same color.
  Persistent storage/processing rights are restricted; no durable provider cache
  or Knowledge ingestion is introduced. Limits may change; no numeric issued-key
  quota was confirmed in the reviewed public pages. Data accuracy, completeness,
  timeliness and uninterrupted service are not guaranteed. Monetization needs a
  separate legal/product review; these findings do not authorize production use.
- [Copyright](https://yandex.ru/dev/rasp/doc/ru/reference/query-copyright):
  `/copyright/` returns banner markup, text and source URL. The documentation asks
  for banner, text, URL next to data. `getCopyright()` is a separate bounded setup
  operation, never automatically repeated for every search. It returns validated
  text/link and a banner-presence flag; raw provider HTML is not rendered or sent
  to the model. Safe banner presentation remains a UI/activation blocker.

## Composition and boundaries

`createYandexRaspNormalizedProvider({ env, bindings })` returns a disabled/null
provider unless all gates pass. The configured provider implements the existing
`NormalizedTransportProvider.search(TransportSearchRequestV1, TransportSearchContext)`.
Compose it with `TransportSearchService`, `registerTransportSearchTool` and
`AiToolRegistry`. AiGateway requires the already-authorized account/trip and approved
normalized request. There is no new public unauthenticated endpoint or automatic
server startup activation.

The older planner `searchRoutes` adapter and its tests remain available for
compatibility. The new normalized path never calls its location-directory downloader
or cache. It reuses the existing isolated request/response mapper and shared HTTP
client, with an additional strict live-page validator before normalization.

## Credentials and activation

`YANDEX_RASP_API_KEY` is server environment only. No frontend-prefixed variable,
key URL, native error cause, request dump or raw response logging is allowed.
Credentials use a private JS field; enumerable factory state contains only status.
No production secret was created or changed.

Mandatory gates: existing fresh terms review, free_public compatibility, configured
credential, quota confirmation, implemented attribution and accepted operational
policy, plus explicit `YANDEX_RASP_NETWORK_ENABLED=true` and
`YANDEX_RASP_FREE_PUBLIC_CONFIRMED=true`. Terms are rechecked by policy on every
search. Invalid limits disable the factory. Host/version are fixed, not env input.

Defaults: `YANDEX_RASP_TIMEOUT_MS=10000` (1–15000 ms),
`YANDEX_RASP_REQUESTS_PER_MINUTE=30` (1–60). These are conservative application
budgets, **not Yandex quota claims**. One shared process budget allows one active
normalized search and limits outbound operations, rejecting excess work without a
queue. A multi-process deployment needs a shared quota limiter and operational
review before activation. There are no automatic retries.

## Mapping and completeness

The full `TransportSearchRequestV1` is unchanged. All request validation remains
before provider execution. Unresolved/missing locations cannot trigger network.
Bindings map trusted ARVELIS IDs to checked `c…`/`s…` codes and station allowlists;
no raw label is a provider code. City bindings require a verified station membership
set. Fixtures contain invented test IDs; they are not an approved live directory.

One direction/mode per operation, sequentially; return direction swaps bindings and
uses returnDate. Mapping is flight→plane, train→train, bus→bus,
suburbanRail→suburban, ferry→water. Unsupported explicit modes/transfer constraints
fail closed. Omitted modes use the adapter's supported subset; preferredMode remains
the existing soft preference. No new passenger, FX or provider request contract.

## HTTP and response validation

The shared native-fetch client uses exact HTTPS origin/version, GET, Authorization,
`redirect:error`, no-store and a deadline covering headers and streamed body. All
redirects fail closed. Optional loopback HTTP injection is restricted to literal
loopback addresses for the older local test stub; the normalized factory exposes
no base URL option. No proxy or URL is accepted from a user/domain request.

Live-page response cap: 256,000 bytes; content length and actual streamed size
checked, JSON Content-Type required, strict UTF-8 decoding. Abort cancels body reads.
No native error cause or provider error body leaves the client. Provider echoes of
the credential, including JSON-escaped echoes, are rejected.

Before normalization the validator checks bounded plain JSON, poison keys/prototypes,
top-level pagination/search/segments/interval arrays, expected from/to/date/offset,
station memberships, thread identity/mode, carrier nullability, timestamps/offsets,
chronology and duration agreement, transfer marker, ticket shape/currency/amounts,
duplicate services and field limits. Unknown provider extension fields are bounded
and discarded; normalized metadata has strict allowed keys. The existing normalized
validator then runs again in TransportSearchService.

## Pagination, normalization and meaning

Page size 10, at most 2 pages per direction/mode, at most 20 normalized routes in
the whole search, at most 20 outbound operations; concurrency 1. Repeated page totals
must agree. Truncation and interval-service omission are explicit coverage metadata.
Interval services are shape-checked but not converted to invented departure times.
Transfers returned despite the direct-only request fail with a typed unsupported
outcome. A partial response with no supported routes is **not** `no_results`.

Normalized routes preserve direction, source/thread identity, origin/destination,
offset-aware departure/arrival, carrier/service number, and page-specific retrievedAt.
Duration remains derivable via the existing `getTransportRouteMetrics` contract.
No raw provider object reaches AiGateway. Additive provider-neutral result metadata
is necessary to represent coverage, attribution and the retrieval freshness policy;
the request contract and AI evidence schema are unchanged.

Ticket observations remain `cached_observation`, never passenger-specific `quoted`.
The existing mapper chooses a minimum only within one validated currency; mixed
currencies produce no unified price. No multiplication by passenger count or FX.
Price evidence remains freshness `unknown`, so it cannot authorize a current price.
Availability always remains `unknown`; schedule existence or et_marker cannot prove
sale/seat availability. No availability evidence is manufactured.

## Freshness, evidence and cache

ARVELIS policy `arvelis-schedule-retrieval-5m-v1` sets a 300-second retrieval-age
window for schedule observations. This is an explicit **internal policy**, not API
expiry/accuracy assurance. Rationale: conservative short request-local use, below
the service's existing 15-minute maximum, with room for bounded Qwen generation.
It does not turn ticket observations into quotes. Metadata and schedule evidence
identify the policy and `providerGuarantee:false`.

Each route keeps the actual page retrievedAt and its corresponding expiresAt;
response retrievedAt is the first/oldest operation. There is no cache or persistence.
The existing registry creates exact tool evidence IDs, correlates request/route/thread
provenance and validates domains/source/freshness. AiGateway retains its post-generation
expiry recheck. The existing Qwen serializer retains its compact projection; provenance
and expiry remain in Gateway's full evidence/validator boundary, while the model sees
the existing ID/domain/source/retrievedAt/freshness representation and normalized text.

After deterministic transport execution, completed transport schema/request remain
absent from model input. Other tools remain available under PR #40's unchanged policy.
Only a small coverage/policy annotation is added to new schedule evidence. Full
result metadata is not copied into the model prompt.

## Errors and telemetry

Typed outcomes distinguish provider_not_configured, unresolved_location,
unsupported_transport_mode/constraint/request, provider_timeout, aborted,
provider_unauthorized, provider_rate_limited, provider_unavailable,
malformed_provider_response and successful no_results. Auth failures, 429, 5xx,
redirects, malformed data and partial unsupported results never mean “no departures”.

Optional telemetry emits only provider/operation/request ID, status/code, elapsed
time, network start/end and duration, parse/validation and normalization duration,
completed page/result counts. Callback failures are isolated. No keys, headers,
locations, prompts, raw data or account identifiers are logged. Deadline, rate and
cancellation do not cause retries or fallback fixtures.

## Verification and continuation

`npm run test:yandex-rasp-live` now runs both the existing loopback HTTP suite and
the new normalized-provider fixture/security suite, also part of `npm run check`.
Tests cover modes, empty/partial results, two-page/capped search, return provenance,
interval services, transfer rejection, malformed/oversized bodies, Content-Type,
station/provider spoofing, timestamps, null carrier/price, currency, 400/401/403/404/
429/5xx/other statuses, redirects, missing gates, invalid parameters, rate/concurrency,
timeouts, body cancellation, copyright setup, secret non-disclosure and evidence.

An integration regression exercises provider-shaped fixture → live adapter code →
service → registry → Gateway → actual Qwen HTTP serializer with a deterministic
fake model response. It asserts completed schema/request absent, preserved evidence,
one generation, body <7 KB for one schedule+price observation, expiry rejection and
unquoted price rejection. This is not a real inference/provider qualification.

Local verification: typecheck, all smoke suites (including 69 new deterministic
Yandex checks), SQLite ownership, server build and frontend build passed. Full local
`npm run check` reached the browser gate and stopped because Chrome/Chromium is
unavailable; this is not recorded as a local full-check pass.

Exact-head `ARVELIS CI` is enabled for this stacked branch/base, including validate
and postgres-compat. Local browser execution requires Chrome; if unavailable, the
actual browser gate runs in CI. Final PR description records actual commands,
results, limitations and run IDs. Existing Qwen golden/semantic settings, model,
timeouts, llama.cpp revision, dependencies and lockfile are unchanged.

To continue in a regular chat: use this document and the new Draft PR; inspect its
actual HEAD/CI first. Next controlled slice is trusted location bindings plus safe
attribution UI/setup and development credential approval. Provide credentials only
through a protected development secret store, never chat. Then run bounded read-only
live smoke and, only after activation gates pass, real provider→Qwen verification.
No live-provider workflow/secret configuration is installed automatically here.
