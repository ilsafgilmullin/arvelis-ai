# ARVELIS AI — безопасность

**Актуальность:** Map Provider Foundation & Route Map V1 / бесплатная user-facing модель, 2026-09-09.

## Global invariants

- Account/Session and Trip ownership are server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider secrets are server-side only;
- external provider output is untrusted input;
- no provider response, auth secret, document or payment data is logged by default;
- billing/subscriptions/paywall remain outside Travel Domain.

## Existing transport/Yandex boundary

Yandex Rasp V1 remains closed without production activation. No live key is present. Existing protections stay in force: approved HTTPS host, Authorization-header key, redirects blocked, response-size limits, exact location matching, temporary-memory-only cache, `et_marker != availability`, no invented provider validity and no persistent Yandex result storage.

## Map data minimization

`MapRouteRequest` sends only map-relevant data:

- Trip ID/revision;
- origin/destination labels;
- explicit saved waypoints;
- coordinates only when already present in the Trip map point.

It does not contain cookies, session secrets, traveler identities, documents, payment data, full Trip aggregate or future map-provider credentials.

## Map provider response validation

A Map response is accepted only after deterministic validation.

Bounds/invariants:

- max 64 resolved points;
- max 16 routes;
- max 4096 geometry coordinates per route;
- max 8 attribution entries;
- latitude in `[-90, 90]`;
- longitude in `[-180, 180]`;
- unique IDs;
- provider/request identity match;
- resolved points must correspond to requested points;
- origin and destination must both resolve;
- route point IDs must reference validated resolved points and include required endpoints;
- source/attribution URLs must use HTTPS;
- distance/duration must be non-negative safe integers.

Malformed or oversized output fails closed.

## User-provided coordinate integrity

A coordinate supplied by the user/current Trip is treated as trusted application input relative to the external provider response.

Provider rules:

- provider must return it as `resolution: provided`;
- latitude/longitude must exactly match the requested value;
- provider may not silently replace it with a geocoded coordinate;
- provider may not bypass the check by labeling the changed value `provider_resolved`.

Any mismatch rejects the normalized response.

## Map ownership/orchestration

`MapOrchestrator` checks authenticated account scope and Trip ownership before provider execution. It supports caller cancellation and a bounded timeout. A missing provider returns truthful `not_connected`; there is no silent fallback to demo geometry.

Audit metadata may contain request ID, Trip ID/revision, provider ID, timing, status and validation codes. It must not contain raw response geometry payloads, secrets or user documents.

## Freshness

Map retrieval time is not equivalent to route validity.

- no `validUntil` => freshness `unspecified`, route not authoritative-current;
- future provider `validUntil` => `current`;
- expired `validUntil` => `expired`.

Future map-adapter cache TTL must describe only local cache age and must not be presented as provider validity.

## Route Map UI truthfulness

No real Map provider/SDK is connected in this slice. The UI must not display fabricated route lines, tiles or coordinates as real data. The old decorative route schematic is hidden. The browser happy-path verifies the truthful empty state and absence of a real map canvas/provider container.

## Persistence / retention

Normalized Map provider results are not automatically persisted into Trip, SQLite or PostgreSQL. A future vendor adapter requires a separate review of terms, attribution, caching and retention before any persistence is introduced.

## CI security

Important gates:

- `npm audit --audit-level=high`;
- strict typecheck;
- Map business/security/freshness smoke;
- lower Plan/Transport/Yandex/Trip regressions;
- server runtime build;
- one server-backed Chromium happy-path including Map empty-state truthfulness;
- frontend build;
- PostgreSQL lower-layer regression;
- GitHub Actions `contents: read`.

## Next security boundary

`Legal Sources & Travel Legal Foundation V1` must require source-backed claims, official HTTPS source provenance for verified requirements, effective-date/freshness handling without invented legal validity, ownership-aware orchestration, no uncited legal conclusions and no live provider credentials.

Production deployment, real map/legal credentials, paid services, destructive data operations and merge to `main` remain forbidden without separate confirmation.
