# Location Resolution Foundation V1

Review date: 2026-09-16.

This checkpoint continues the Travel stack after Draft PR #41 and introduces a provider-neutral trust boundary between free-form user location text and the already-qualified production transport search contract.

**No production location provider, geocoder, provider dataset, Yandex network activation, deployment or merge is part of this checkpoint.**

## Source of truth

- Draft PR: #42.
- Branch: `feat/travel-location-resolution-foundation-v1`.
- Base branch: `feat/travel-yandex-rasp-live-provider-v1` / Draft PR #41.
- Exact base checkpoint: `2d2b9a0e7f548c22f455f3fde59a1f17cc93c427`.
- Qualified implementation HEAD before this documentation commit: `6ef54d0ee5e08376de90961b5f4a600aa172650f`.
- Exact implementation CI: `35094638989` — SUCCESS.
- Existing transport request contract remains `TransportSearchRequestV1`.
- Existing runtime transport boundary remains `POST /api/trips/:tripId/transport/search`.

## Problem being closed

A persisted Trip currently stores human-readable origin and destination strings. Production transport execution, however, accepts only trusted ARVELIS location identities (`arvelis:*`) before a provider-specific adapter may map those identities to its own codes.

Free-form user text, model text, a browser-supplied provider code, or a provider response must therefore never become a trusted transport identity implicitly.

This slice establishes the neutral resolution contract and service boundary needed before any real location provider can be selected or any Routes UI search action can be enabled.

## Provider-neutral contract

`src/travel/locationResolution.ts` defines:

- `LocationResolutionQueryV1`;
- `TravelLocationCandidateV1`;
- `LocationResolutionResponseV1`;
- strict validation for queries and candidates;
- conversion from an explicitly selected ARVELIS candidate into `TransportSearchLocationV1`.

A candidate carries only ARVELIS-controlled fields:

- `locationId` — an internal `arvelis:*` identity;
- `displayName`;
- `type` — `city`, `station` or `airport`;
- optional `countryCode`;
- optional `region`;
- optional validated IANA timezone.

Provider-specific station/city codes are intentionally absent from this public/domain contract.

## Input and output bounds

The foundation is deliberately bounded:

- maximum query payload: 2,048 bytes;
- maximum raw label: 160 characters;
- maximum region: 80 characters;
- maximum candidates: 10;
- locale in V1: `ru-RU`;
- country code, when supplied, must be two uppercase ISO-style letters;
- duplicate location IDs are rejected;
- unknown top-level or candidate fields are rejected;
- accessors, exotic prototypes, poison keys, cycles and excessive structure are rejected;
- malformed or invalid timezone values are rejected.

The resolver cannot return an unbounded provider object into the application domain.

## Resolution semantics

The normalized response has only three successful states:

- `resolved` — exactly one candidate;
- `ambiguous` — two or more candidates;
- `unresolved` — no candidates.

The foundation never auto-selects a result from an ambiguous response. User-facing selection or a separately approved deterministic disambiguation policy is required before an ambiguous candidate can become a resolved transport location.

`candidateToTransportSearchLocation()` accepts only an already-validated candidate and preserves the original user label separately from the normalized display name/internal identity.

## Directory port and service boundary

`server/travel/locationResolutionService.ts` defines the provider-neutral `TravelLocationDirectory` port.

A future implementation may use an approved internal directory or external source, but the adapter must return ARVELIS candidates rather than provider-specific codes.

`LocationResolutionService` is fail-closed and provides:

- strict query validation before provider execution;
- nullable/unconfigured resolver support;
- bounded timeout (default 5 seconds; allowed 250 ms to 15 seconds);
- caller cancellation through `AbortSignal`;
- sanitized `rate_limited` / `unavailable` provider errors;
- malformed resolver response rejection;
- duplicate candidate rejection;
- bounded candidate count;
- no propagation of provider exception text into the normalized outcome.

Typed failure outcomes are:

- `invalid_location_query`;
- `resolver_not_configured`;
- `resolver_timeout`;
- `resolver_rate_limited`;
- `resolver_unavailable`;
- `malformed_resolver_response`;
- `aborted`.

## Yandex Rasp dataset constraint

The official Yandex Rasp `stations_list` endpoint was rechecked on 2026-09-16:

- documentation: `https://yandex.ru/dev/rasp/doc/ru/reference/stations-list`;
- official API terms: `https://yandex.ru/legal/rasp_api/ru/`.

The endpoint returns the full geography hierarchy (countries -> regions -> settlements -> stations) and the official documentation states that the JSON response is about 40 MB.

However, section 3.2.4 of the current Yandex Rasp API terms prohibits storing, processing or modifying API Data except temporary caching of results for improving the API-backed service functionality.

Therefore this project must **not** download `stations_list` and turn it into a permanent ARVELIS location database or canonical durable directory.

This finding does not select or reject Yandex Rasp as a schedule provider. It only prevents using its API dataset as a persistent first-party location directory without a separately valid legal basis or written agreement.

## Current provider decision

No production location-resolution provider is selected in this slice.

The next provider decision must separately evaluate at least:

- legal permission for persistent/stable identifiers and any local cache;
- Russia accessibility without VPN where feasible;
- free-service compatibility;
- supported geography;
- city/station/airport coverage;
- ambiguity/disambiguation behavior;
- stable identifiers and revision semantics;
- rate limits and quotas;
- attribution requirements;
- privacy/data-transfer impact;
- failure behavior and availability;
- ability to map a neutral ARVELIS identity to transport-provider bindings without leaking provider codes into client state.

Provider selection is an explicit architecture/product decision and is not implied by this foundation.

## Verification

Deterministic smoke coverage includes:

- valid query validation;
- missing/unknown/oversized input rejection;
- invalid locale/country/type/limit rejection;
- prototype/accessor/poison/cycle rejection;
- valid candidate conversion;
- invalid provider-specific field leakage rejection;
- duplicate location ID rejection;
- resolved response with one candidate;
- ambiguous response with multiple candidates;
- unresolved response with zero candidates;
- configured and unconfigured directory behavior;
- directory context/request ownership propagation;
- timeout and provider signal cancellation;
- caller abort;
- rate-limited/unavailable errors;
- malformed provider output.

The first PR-triggered run after adding the new gate (`35094473494`) failed only because `location-resolution-foundation` had not yet been registered in the smoke-runtime allowlist. The new contract itself had not executed at that failed step. The target was added without weakening any test or production boundary.

Exact implementation run `35094638989` then completed successfully, including:

- dependency audit;
- TypeScript typecheck;
- plan orchestration policy;
- production transport search contract;
- Location Resolution Foundation;
- transport business/freshness policy;
- transport provider + Map + Legal foundations;
- AI/Knowledge and Retrieval regressions;
- Qwen runtime and llama.cpp adapter regressions;
- Yandex Rasp adapter/runtime safety regressions;
- Trip server ownership/persistence;
- production server runtime build;
- real browser Travel happy-path;
- frontend build;
- full `npm run check`;
- PostgreSQL migrations/Trip ownership;
- pgvector Knowledge isolation/retrieval.

## Toolchain and repository impact

- `package-lock.json` is unchanged.
- No dependency was added or upgraded.
- Node engine remains `>=22.12.0 <27`.
- GitHub CI uses Node `24.19.0`.
- Replit configuration remains on `nodejs-22`.
- No database migration was added.
- No environment variable or secret was added.
- No provider credential is read by this foundation.
- No frontend route or user-visible search action was enabled.

## Qualification

- `LOCATION_RESOLUTION_CONTRACT_READY`: yes.
- `LOCATION_RESOLUTION_SERVICE_READY`: yes.
- `PROVIDER_NEUTRALITY_PRESERVED`: yes.
- `PRODUCTION_LOCATION_PROVIDER_SELECTED`: no.
- `PRODUCTION_LOCATION_DIRECTORY_READY`: no.
- `ROUTES_UI_LOCATION_RESOLUTION_ENABLED`: no.
- `LIVE_LOCATION_RESOLUTION_VERIFIED`: no.
- `LIVE_YANDEX_PROVIDER_VERIFIED`: no.
- `END_TO_END_VERIFIED`: no.
- `PRODUCTION_ACTIVATED`: no.

## Security / truthfulness invariants

Do not:

- treat free-form user/model text as a trusted location identity;
- put Yandex or another provider's station/city codes in client state as ARVELIS IDs;
- silently auto-select one candidate from an ambiguous resolver result;
- persist a provider dataset unless its terms explicitly permit the intended persistence/use;
- use Yandex `stations_list` as a durable ARVELIS database under the current API terms;
- enable the Routes transport request before a production resolver and candidate-selection path are approved;
- leak resolver credentials/raw error bodies/raw provider objects to the frontend or model;
- copy the protected Yandex development key into GitHub Actions;
- weaken existing auth/Trip ownership/evidence/golden/security gates;
- increase Qwen timeout limits as part of location resolution;
- deploy production or merge to `main` as part of this checkpoint.

## Next safe boundary

The repository-side foundation is complete. The next slice should evaluate and choose a production-capable location-resolution strategy, then implement that strategy behind `TravelLocationDirectory` with its own legal/security/availability qualification.

Until that explicit decision is made, keep the resolver unconfigured and the user-facing Routes search action disabled.