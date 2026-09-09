# ARVELIS AI — безопасность

**Актуальность:** Legal Sources & Travel Legal Foundation V1 / бесплатная user-facing модель, 2026-09-09.

## Global invariants

- Account/Session and Trip ownership are server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider secrets are server-side only;
- external provider output is untrusted input;
- no provider response, auth secret, document or payment data is logged by default;
- billing/subscriptions/paywall remain outside Travel Domain.

## Existing provider boundaries

Yandex Rasp remains closed without production activation or live key. Map V1 remains provider-neutral with no real map vendor/credentials. Existing Transport/Map protections and temporary-cache/coordinate-integrity rules stay in force.

## Legal data minimization

`LegalCheckRequest` contains only route-general fields:

- Trip ID/revision;
- origin;
- destination;
- optional trip dates;
- `scope: route_general`.

It must not contain cookies, session secrets, documents, payment data, traveler identities or future Legal provider credentials.

Current `Trip` has no citizenship, nationality, passport or residence-permit fields. Legal V1 therefore must not infer, default or fabricate them. Personalized visa/entry eligibility cannot be asserted from the current model.

## Legal source/claim validation

External Legal responses are accepted only after deterministic validation.

Required invariants:

- provider/request identity match;
- bounded source/claim counts;
- unique IDs;
- source URLs use HTTPS;
- source retrieval/effective dates have valid formats;
- every claim references at least one existing source;
- a `verified` claim may only cite `official` sources;
- a secondary source cannot elevate a claim to verified/authoritative;
- malformed or uncited output fails closed.

No uncited legal conclusion is allowed through the normalized boundary.

## Authority / freshness

Legal retrieval time is not equivalent to legal validity.

A claim can be authoritative only when:

1. provider marked it `verified`;
2. all cited sources are official HTTPS sources;
3. source validity is explicitly bounded and non-expired;
4. normalized validation succeeded.

Freshness semantics:

- explicit expired `effectiveUntil` => `expired`, non-authoritative;
- no explicit validity end => `unknown`, non-authoritative;
- all source validity windows explicit and non-expired => `current`.

The application must not manufacture an effective date or convert `retrievedAt` into legal validity.

## Legal ownership/orchestration

`LegalOrchestrator` checks authenticated account scope and Trip ownership **before** provider execution. Foreign ownership therefore cannot trigger a Legal provider call.

It also provides:

- bounded provider timeout;
- caller cancellation;
- truthful `not_connected` when no provider is configured;
- validation of untrusted normalized output;
- typed fail-closed errors;
- audit metadata limited to request/trip/provider identity, timing, status and validation codes.

Audit must not contain raw source documents, provider credentials, cookies or user documents.

## Persistence / retention

Legal Foundation does not automatically write provider claims/sources into `Trip`, SQLite or PostgreSQL. Any future source ingestion or retention requires a separate terms/privacy/retention review.

## AI boundary

Future ARVELIS AI Engine must not use model inference as an authoritative source for:

- legal rules;
- price;
- transport schedule;
- availability;
- weather.

Legal facts must flow through validated Legal tools/evidence. The model may summarize or reason over evidence but must preserve provenance and authority status.

## CI security

Important Legal V1 gates:

- `npm audit --audit-level=high`;
- strict typecheck;
- Legal business/security/freshness smoke;
- lower Plan/Transport/Map/Yandex/Trip regressions;
- server runtime build;
- one existing server-backed Chromium happy-path;
- frontend build;
- stacked PR PostgreSQL lower-layer regression;
- GitHub Actions `contents: read`.

## Production / STOP boundaries

No real Legal source provider/credential or production ingestion is connected in Legal Foundation V1.

After AI/Knowledge Foundation, stop before selecting/activating a real model runtime, embedding provider, vector DB or production knowledge source set. Production deployment, paid services, destructive migrations and merge to `main` remain forbidden without separate confirmation.
