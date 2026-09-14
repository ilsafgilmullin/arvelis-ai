# Production Transport Search Contract V1

Date: 2026-09-14. Branch: `feat/travel-production-transport-search-contract-v1`.
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
publish the new structural tool schema and the approved request in runtime context.
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
