# Transport Runtime API Boundary V1

Review date: 2026-09-16.

This checkpoint continues Draft PR #41 and connects the already-qualified transport
search domain/service boundary to the authenticated ARVELIS Node runtime without
activating Yandex network access or presenting provider fixtures as real data.

**Production activation, deployment, live provider verification and merge are not part of
this checkpoint.**

## Source of truth

- Branch: `feat/travel-yandex-rasp-live-provider-v1`.
- Base: `feat/travel-production-transport-search-contract-v1` / PR #40 qualified HEAD
  `a4c5cfa3ebce8a1762fec3046da514df4f532fc9`.
- User-facing transport contract remains `TransportSearchRequestV1` and the existing
  normalized `TransportSearchResponse`.
- Existing auth/session and persisted Trip ownership remain authoritative for the HTTP
  request boundary.

## Runtime endpoint

The Node runtime now exposes:

`POST /api/trips/:tripId/transport/search`

The endpoint is not a direct Yandex proxy. Its execution chain is:

1. existing same-origin mutation guard;
2. authenticated ARVELIS session;
3. account-scoped persisted Trip lookup;
4. bounded JSON body parsing;
5. exact top-level body shape `{ request }`;
6. `TransportSearchRequestV1` validation;
7. persisted-Trip binding validation;
8. `TransportSearchService`;
9. normalized provider boundary;
10. normalized response only.

Provider raw responses, API credentials, provider error bodies and evidence internals are
not returned to the browser.

## Trip-bound request policy

`searchTransportForAuthorizedTrip()` requires the request to remain attached to the
already-authorized persisted Trip.

Before any provider can execute, the boundary checks:

- Trip owner scope equals the authenticated account scope;
- destination is explicit;
- destination is not marked unknown;
- dates are exact, not flexible;
- outbound and return dates are present;
- traveler count is 1..9, matching Transport Search V1;
- request origin label matches the persisted Trip origin;
- request destination label matches the persisted Trip destination;
- request departure date matches the persisted Trip start date;
- request return date matches the persisted Trip end date;
- request adult count matches the persisted Trip traveler count.

A browser therefore cannot reuse authorization for one Trip while silently changing the
route, dates or traveler count in the transport request.

This boundary does **not** treat a client-supplied provider code as trusted. The request
still carries only an ARVELIS `locationId`; the Yandex adapter resolves that identity only
through the server-controlled trusted binding manifest.

## Runtime Yandex composition

`loadYandexRaspRuntimeProvider()` is fail-closed and network-free during composition.

Development reads only:

`config/yandex-rasp-development-bindings.v1.json`

Production expects a separate, not-yet-created:

`config/yandex-rasp-production-bindings.v1.json`

The strict trusted-binding parser enforces the environment value. Production therefore
cannot fall back to or reuse the reviewed development manifest by accident.

If the expected manifest is missing, invalid or empty, runtime composition returns a
null provider with `trusted_bindings_unavailable`.

Even with a valid development manifest, the normalized provider remains null while the
existing activation gates are false. Loading the runtime provider performs no external
Yandex request.

## HTTP failure semantics

The browser receives typed, sanitized errors. Current mappings include:

- ownership/access rejection -> HTTP 403;
- invalid/incomplete/trip-mismatched request -> HTTP 422 where applicable;
- provider not configured/unavailable/unauthorized -> HTTP 503;
- provider rate-limited -> HTTP 429;
- provider timeout -> HTTP 504;
- malformed provider response -> HTTP 502;
- caller cancellation -> HTTP 408.

No provider exception text, secret, Authorization header or raw response is propagated.

## Verification added

Deterministic tests now cover:

- valid trip-bound synthetic execution;
- account ownership mismatch;
- route label mismatch;
- date mismatch;
- passenger-count mismatch;
- flexible-date Trip rejection;
- unknown-destination Trip rejection;
- unresolved-location fail-closed behavior;
- disconnected provider behavior;
- sanitized HTTP status mapping;
- development manifest loading;
- missing/invalid manifest fail-closed behavior;
- production rejection of a development manifest;
- provider factory/composition performing zero network requests;
- current activation flags keeping the runtime provider disabled.

Synthetic test provider data is test-only and is never presented in the application UI.

## Current product boundary

The active Routes UI still does **not** issue this request and still passes
`response={null}` to the transport results surface.

That is intentional. The persisted Trip model currently stores human-readable origin and
destination strings, while production transport execution requires trusted ARVELIS
location identities. The project does not yet have an approved production location
directory/resolver that can convert arbitrary user locations into those identities.

Therefore the next product/runtime step must establish a trusted location-resolution
boundary before enabling the Routes UI search action. Do not guess Yandex codes, embed
provider codes in client state, or treat free-form model/user text as a trusted binding.

## Current activation state

The following gates remain false:

- `YANDEX_RASP_NETWORK_ENABLED=false`
- `YANDEX_RASP_FREE_PUBLIC_CONFIRMED=false`
- `YANDEX_RASP_QUOTA_CONFIRMED=false`
- `YANDEX_RASP_ATTRIBUTION_IMPLEMENTED=false`
- `YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED=false`

The protected development key remains only in the Replit secret store. No GitHub Action
or repository file receives its value.

## Status

- `IMPLEMENTATION_COMPLETE`: yes.
- `PRE_LIVE_HARDENED`: yes.
- `RESULT_PRESENTATION_READY`: yes.
- `RUNTIME_API_BOUNDARY_READY`: yes after exact-head CI.
- `TRUSTED_PRODUCTION_LOCATION_RESOLUTION_READY`: no.
- `LIVE_PROVIDER_VERIFIED`: no.
- `END_TO_END_VERIFIED`: no.
- `PRODUCTION_ACTIVATED`: no.

## Prohibited shortcuts

Do not:

- enable Yandex application gates merely because the runtime endpoint now exists;
- copy the Replit key to GitHub Actions;
- create a production binding manifest from guessed provider codes;
- use the development binding manifest in production;
- resolve arbitrary text through the deprecated label-based provider path;
- expose provider credentials, raw error bodies or raw provider HTML to the frontend;
- show fixtures/mock routes as real search results;
- increase Qwen timeout limits or weaken evidence/golden/security gates;
- deploy production or merge to `main` as part of this checkpoint.
