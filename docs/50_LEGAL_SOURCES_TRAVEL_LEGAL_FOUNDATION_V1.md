# Legal Sources & Travel Legal Foundation V1

**Date:** 2026-09-09  
**Branch:** `feat/travel-legal-sources-foundation-v1`  
**Base:** `bd46fc12064faf2dd807782c35106ec062bb08dd`

## Goal

Create a provider-neutral Travel Legal foundation that can later consume real legal-source adapters without turning model inference or uncited text into legal fact.

No real legal provider, credentials, production ingestion or persistent legal-source store is connected in this slice.

## Scope boundary

V1 is `route_general` only.

The existing `Trip` model contains origin, destination and trip dates, but does not contain traveler citizenship, nationality, passport details, residence permits or visa history. Therefore V1 must not produce personalized visa/entry eligibility conclusions.

`LegalCheckRequest` intentionally contains only:

- `tripId`;
- `tripRevision`;
- origin;
- destination;
- optional start/end dates;
- `scope: route_general`.

## Typed source and claim contracts

`LegalSourceReference` records source provenance:

- source identity;
- title/publisher;
- HTTPS URL;
- `official | secondary` type;
- `retrievedAt`;
- optional effective validity window.

`LegalClaim` records:

- legal category;
- concise summary;
- source IDs;
- `verified | needs_review` status.

Categories in V1: entry, visa, passport, transit, insurance, registration, customs, health and other.

Every claim must cite at least one source. An uncited claim is invalid normalized output.

## Authority policy

A `verified` claim may cite only official sources. Secondary sources may support `needs_review` content but cannot establish an authoritative legal fact.

Legal source URLs must use HTTPS.

A claim is authoritative only when all cited sources are official HTTPS sources, the claim is verified, and freshness is explicit/current.

## Freshness

`retrievedAt` does not prove a legal rule is currently valid.

- source with expired `effectiveUntil` => claim `expired`;
- missing validity end => claim freshness `unknown`;
- all cited sources with explicit non-expired validity => `current`.

`expired` and `unknown` claims are always non-authoritative.

## LegalOrchestrator

`server/travel/legalOrchestrator.ts` provides:

- authenticated account validation;
- Trip ownership fail-closed before provider call;
- minimized request creation;
- truthful `not_connected` when provider is absent;
- timeout/cancellation;
- provider/request identity validation;
- untrusted source/claim validation;
- per-claim authority/freshness evaluation;
- typed audit/error boundary.

It does not mutate or persist `Trip` automatically.

## Security and truthfulness

Legal V1 explicitly rejects:

- uncited legal conclusions;
- verified claims backed by secondary-only sources;
- non-HTTPS source URLs;
- malformed provider/request identity;
- fabricated traveler citizenship/passport context;
- treating unknown/expired source validity as authoritative current law.

No source document body, credentials, auth cookies or traveler documents are included in orchestration audit metadata.

## Test gate

`npm run test:legal-foundation` verifies the important rules only:

- ownership fails before provider invocation;
- request is route-general/minimized;
- citizenship/passport fields are absent;
- official/current claim can be authoritative;
- uncited claim is rejected;
- verified secondary-source claim is rejected;
- unknown/expired freshness is non-authoritative;
- missing provider returns `not_connected`;
- cancellation is honored.

No second browser suite was added because this slice does not introduce a new interactive Legal UI flow. The existing server-backed Chromium regression remains the single browser happy-path.

## Explicit non-goals

- real Legal source adapter;
- live government/consular ingestion;
- citizenship/passport profile model;
- personalized legal advice;
- real AI/model/RAG runtime;
- production credentials;
- production deployment;
- destructive migrations;
- merge to `main`.

## Next slice

After a green stacked PR checkpoint, continue with `ARVELIS AI Engine & Knowledge Foundation V1`.

That next foundation must remain vendor-neutral and must stop before choosing/activating a real model runtime, embedding provider, vector database or production knowledge-ingestion strategy.
