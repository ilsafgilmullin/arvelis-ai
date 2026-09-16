# Yandex Rasp Pre-Live Hardening V1

Review date: 2026-09-16. This document continues Draft PR #41 and records the
security boundary immediately before the first real development API smoke.

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

## Why this matters

This prevents a future composition mistake from bypassing the trusted-binding model by
supplying a user/model label to the old `stations_list` resolver. The old implementation
remains available to deterministic tests without becoming a second production path.

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
- `PRE_LIVE_HARDENED`: achieved once exact-head CI for this boundary is green.
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
