# ARVELIS AI — архитектура

**Актуальность:** Map Provider Foundation & Route Map V1, 2026-09-09.

## Core invariants

- `Trip` remains the core product aggregate;
- UI, domain, persistence, orchestration and external-provider adapters are separate layers;
- authenticated server session is authoritative for ownership;
- provider output is untrusted until deterministic validation;
- external facts require provenance/freshness;
- provider-specific IDs, terms, quotas and credentials do not enter `Trip`;
- secrets stay server-side;
- no mock/fake data is presented as real provider output.

## Closed lower layers

- Travel UI V2;
- Server-side Trip Persistence & API V1;
- Plan Real-Data Contract & AI Orchestration Policy V1;
- Transport Normalized Route Contract V1;
- Transport Provider Strategy & Adapter Foundation V1;
- Yandex Rasp Live Adapter V1 — implementation closed, production key not activated.

## Transport / Yandex boundary

Transport remains normalized through `TransportProvider` and `TransportOrchestrator`. Yandex-specific station codes, attribution, terms, quotas and cache rules remain in the adapter/application layer. Yandex results are temporary-memory-only and no live production key is configured.

## Map Provider Foundation V1

### Provider-neutral contract

`src/travel/mapContracts.ts` defines:

- `MapRouteRequest` — Trip ID/revision plus map-relevant origin/destination/waypoints;
- `MapResolvedPoint` — normalized coordinate + resolution provenance;
- `MapRouteGeometry` — bounded route geometry with optional distance/duration/source URL;
- `MapRouteResponse` — provider/request identity, retrieval time, optional provider validity, points/routes/attributions;
- `MapResponsePolicy` — current/expired/unspecified freshness.

The request intentionally does not include account secrets, traveler identities, documents, payment data or map-vendor IDs.

### User coordinate integrity

If a request point already has a user-provided coordinate, a provider response cannot silently replace it. It must return `resolution: provided` with the same coordinate. A different coordinate or an attempt to relabel it as `provider_resolved` fails validation.

Origin and destination must both be resolved before normalized route geometry is accepted. Route references must use normalized response point IDs and include the required route endpoints.

### Validation bounds

Map provider responses are bounded and validated for:

- provider/request identity;
- unique IDs;
- requested-point membership;
- latitude/longitude ranges;
- point/route/geometry count limits;
- HTTPS source/attribution URLs;
- non-negative safe-integer distance/duration;
- user-coordinate integrity;
- required origin/destination resolution.

### MapOrchestrator

`server/travel/mapOrchestrator.ts` mirrors the established provider-neutral orchestration pattern:

1. validates account scope;
2. checks Trip ownership;
3. creates minimized Map request;
4. returns truthful `not_connected` when provider is absent;
5. applies timeout/cancellation;
6. validates untrusted provider response;
7. evaluates freshness policy;
8. does not mutate/persist Trip automatically.

Default provider timeout is 12 seconds and is bounded to 60 seconds.

### Freshness

A local retrieval timestamp does not prove a route is current.

- future provider `validUntil` => `current`;
- expired `validUntil` => `expired`;
- no provider validity => `unspecified` and `routeAuthoritative: false`.

Application cache age, if introduced by a future vendor adapter, must remain separate from provider validity.

## Route Map presentation

No real map vendor is connected in this foundation slice. Active UI therefore remains a truthful empty state. The old decorative pseudo-route schematic is hidden so a generated-looking route is not shown before validated map data exists.

Existing `Trip.mapPoints` remain the lower-level stored user/provider points from the foundation model. Normalized Map provider responses are not automatically persisted into `Trip`, SQLite or PostgreSQL.

## CI / testing

Signal-bearing gates include:

- dependency audit;
- strict project typecheck;
- Plan/Transport regressions;
- Map provider business/security/freshness smoke;
- Yandex regression;
- Trip ownership regression;
- server runtime build;
- one server-backed Chromium happy-path, now including the truthful Map empty-state path;
- frontend build;
- PostgreSQL lower-layer regression in the stacked PR.

CI keeps `contents: read`.

## Next layer

After the Map checkpoint closes, the next stacked slice is `Legal Sources & Travel Legal Foundation V1`. It will follow the same pattern: minimized request, source-backed claims, official-source provenance, freshness/effective-date policy, ownership-aware orchestration and no live provider activation.
