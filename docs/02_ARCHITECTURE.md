# ARVELIS AI — архитектура

**Актуальность:** Legal Sources & Travel Legal Foundation V1, 2026-09-09.

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
- Yandex Rasp Live Adapter V1 — implementation closed, production key not activated;
- Map Provider Foundation & Route Map V1 — Draft PR #33, green, no real map provider.

## Transport / Yandex boundary

Transport remains normalized through `TransportProvider` and `TransportOrchestrator`. Yandex-specific station codes, attribution, terms, quotas and cache rules remain in the adapter/application layer. Yandex results are temporary-memory-only and no live production key is configured.

## Map Provider Foundation V1

`src/travel/mapContracts.ts` defines provider-neutral map requests/responses, normalized point resolution, route geometry, attribution and freshness. `MapOrchestrator` checks ownership before provider execution, applies timeout/cancellation, validates untrusted output and does not persist provider geometry automatically.

User-provided coordinates cannot be silently replaced by a provider. Missing provider validity remains `unspecified` rather than authoritative-current. Active UI therefore stays truthful while no real map provider is connected.

## Legal Sources & Travel Legal Foundation V1

### Scope boundary

Legal V1 is intentionally `route_general` only.

Current `Trip` does not contain citizenship, nationality, passport number/type, residence permit, visa history or traveler identity details. The Legal layer therefore cannot answer personalized questions such as whether a specific traveler needs a visa. It must not infer or invent those fields.

`LegalCheckRequest` contains only:

- contract version;
- Trip ID/revision;
- origin;
- destination;
- optional start/end dates;
- `scope: route_general`.

This is the data-minimization boundary between Travel Domain and future legal-source adapters.

### Source contract

`LegalSourceReference` records:

- stable source ID;
- title/publisher;
- HTTPS URL;
- `official | secondary` source type;
- retrieval time;
- optional effective-from/effective-until dates.

`LegalClaim` records category, summary, source references and `verified | needs_review` status.

Every claim must reference at least one source. An uncited conclusion fails validation.

A `verified` claim can reference only official sources. A secondary source may support a `needs_review` claim but cannot establish an authoritative legal fact.

### Freshness / effective dates

Retrieval time alone does not prove legal validity.

For each claim the application derives:

- `expired` — at least one cited source is past explicit `effectiveUntil`;
- `current` — all cited sources have explicit non-expired `effectiveUntil`;
- `unknown` — source validity window is incomplete.

A claim is authoritative only when all of the following hold:

1. status is `verified`;
2. freshness is `current`;
3. at least one cited source exists;
4. all cited sources are `official`;
5. every cited source URL is HTTPS.

`expired` and `unknown` freshness are never authoritative.

### LegalOrchestrator

`server/travel/legalOrchestrator.ts` follows the established provider-neutral orchestration pattern:

1. validates account scope;
2. checks Trip ownership before any provider call;
3. creates minimized route-general request;
4. returns truthful `not_connected` when no provider is configured;
5. applies caller cancellation and bounded timeout;
6. validates provider/request identity and normalized legal output;
7. evaluates per-claim freshness/authority;
8. does not mutate or persist `Trip` automatically.

Default provider timeout is 12 seconds and is bounded to 60 seconds.

Provider failures, malformed payloads, missing citations, verified secondary-source claims and request/provider identity mismatches fail closed.

## AI/Knowledge next boundary

After Legal V1 closes, `ARVELIS AI Engine & Knowledge Foundation V1` may introduce provider-neutral AI gateway/runtime ports, Knowledge evidence/retrieval contracts and a tool registry over Trip/Transport/Map/Legal.

The AI layer must not become a source of truth for prices, transport schedules, legal rules, weather or availability. Those facts must come from normalized tools/provider evidence. Model output remains inference unless source-backed through the applicable tool/evidence contract.

No model/runtime, embedding provider, vector database or production knowledge ingestion is selected by this architecture document.

## CI / testing

Signal-bearing gates for Legal V1:

- dependency audit;
- strict project typecheck;
- existing Plan/Transport/Map/Yandex regressions;
- one Legal business/security/freshness gate;
- Trip ownership regression;
- server runtime build;
- one existing server-backed Chromium happy-path;
- frontend build;
- PostgreSQL lower-layer regression in the stacked PR.

CI keeps `contents: read`.
