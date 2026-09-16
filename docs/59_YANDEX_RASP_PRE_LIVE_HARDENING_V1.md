# Yandex Rasp Pre-Live Hardening V1

Review date: 2026-09-16. This document continues Draft PR #41 and records the
security and presentation boundary immediately before the first real development API
smoke.

**This document does not authorize production activation, deployment or merge.**

## Current source of truth

- Branch: `feat/travel-yandex-rasp-live-provider-v1`.
- Base: qualified Production Transport Search Contract V1 from PR #40.
- Real Yandex development credential: stored only as protected Replit secret
  `YANDEX_RASP_API_KEY`; the value is not copied into GitHub, documentation, frontend
  variables or CI.
- Reviewed development bindings remain limited to the two explicitly verified station
  identities in `config/yandex-rasp-development-bindings.v1.json`.
- Product activation flags remain false.

## Legacy provider boundary

The repository still retains the older `createYandexRaspLiveProvider` implementation so
its historical adapter/cache behavior remains regression-testable. That implementation
resolves human-readable labels through `stations_list` and therefore does **not** satisfy
the Production Transport Search Contract V1 trusted-binding requirement.

It is now explicitly legacy/development-only:

- the factory is marked deprecated;
- credentials and ordinary provider activation flags are insufficient to enable it;
- it additionally requires the explicit code-level option
  `allowLegacyDevelopmentResolver: true`;
- `NODE_ENV=production` always rejects it, even when the development option is supplied;
- the disabled state exposes the typed blocker `legacy_path_disabled`;
- deterministic stub tests explicitly opt into the legacy development resolver;
- `tsconfig.server-runtime.json` no longer includes `yandexRaspLiveProvider.ts`, so the
  legacy factory is not emitted as part of the production server runtime build.

The only provider implementation intended for future real application wiring is
`createYandexRaspNormalizedProvider`, which requires trusted ARVELIS location bindings,
strict `TransportSearchRequestV1` validation, provider activation policy, evidence and
freshness handling.

## Provider activation hardening

A terms-review timestamp must now be a valid timestamp that is not in the future and is
not older than the existing 24-hour activation window. A future timestamp is treated as
`terms_review_stale` rather than accidentally passing through an absolute time
difference. Deterministic provider-policy coverage locks this fail-closed behavior.

## Transport result presentation boundary

`TransportResultsScreen` now provides a mobile-first presentation boundary for an
already validated `TransportSearchResponse`.

It does not call Yandex, read provider secrets or construct provider data. The active
Routes screen passes `response={null}`, so the product still shows a truthful empty state
until a real backend response is wired. No demo/mock route is presented as real data.

When a validated response is eventually supplied, the surface:

- renders normalized mode, origin/destination, offset-preserving departure/arrival,
  duration and transfer count;
- shows price only when the existing transport policy marks that price authoritative;
- never upgrades unknown/non-authoritative seat availability into an availability claim;
- marks expired/unspecified freshness visibly;
- exposes partial coverage instead of implying the result set is complete;
- places provider attribution immediately after the provider-backed result list;
- uses `YandexRaspProviderAttribution` only for `yandex-rasp-v3` and the provider-neutral
  attribution component for other future providers;
- keeps mobile layouts bounded at narrow iPhone widths without horizontal overflow.

The Yandex attribution primitive itself continues to use the reviewed provider-hosted
banner without injecting raw provider HTML. CI locks the banner/text/URL sequence and the
result-adjacent presentation contract.

`YANDEX_RASP_ATTRIBUTION_IMPLEMENTED` must still remain `false`: the presentation
boundary exists, but no real Yandex-backed runtime result has yet traversed the backend
and been browser-verified in that surface.

## Why this matters

These boundaries prevent a future composition mistake from bypassing trusted locations,
forging a fresh terms review, or showing non-authoritative provider claims as current
facts. The old implementation remains available to deterministic tests without becoming
a second production path.

No provider behavior, Qwen timeout, protected-fact validation, evidence contract or
qualified model-facing projection was weakened.

## Live-smoke boundary

The isolated `smoke:yandex-rasp-development` command remains the next real-provider
evidence gate. It is separate from application activation and continues to:

- refuse production;
- require explicit one-run approval;
- require the application network gate to remain disabled;
- use the protected development credential only at runtime;
- use reviewed trusted bindings;
- issue a bounded `/copyright/` request and one bounded `/search/` request;
- sanitize output and never print the credential.

The current chat/GitHub toolchain has no non-Agent execution primitive that can run a
command inside the user's Replit environment with access to its protected secret.
Therefore repository and CI work can be completed autonomously, while a real external
request must remain unclaimed until an approved runtime with access to that secret can
actually execute it.

## Status vocabulary

- `IMPLEMENTATION_COMPLETE`: achieved for the provider implementation.
- `PRE_LIVE_HARDENED`: achieved after exact-head CI at the recorded checkpoint is green.
- `RESULT_PRESENTATION_READY`: achieved after exact-head CI covers the normalized result
  surface and result-adjacent attribution boundary.
- `LIVE_PROVIDER_VERIFIED`: not achieved until the real Yandex development smoke runs.
- `END_TO_END_VERIFIED`: not achieved until real provider data traverses evidence,
  AiGateway and Qwen and passes validation.
- `PRODUCTION_ACTIVATED`: explicitly out of scope.

## Prohibited shortcuts

Do not:

- copy the Replit development API key into GitHub Actions merely to avoid the runtime
  boundary;
- expose the key through `VITE_*`, query parameters, logs, artifacts or chat;
- re-enable the legacy resolver in production;
- infer or guess additional Yandex location codes;
- mark the provider live-verified from fixtures or CI-only tests;
- enable production flags, deploy, or merge as part of this checkpoint.
