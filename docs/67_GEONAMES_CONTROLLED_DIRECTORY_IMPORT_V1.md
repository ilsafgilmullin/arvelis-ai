# GeoNames Controlled Directory Import V1

Status: implementation candidate; not production-activated.

## Scope

This slice connects the already qualified GeoNames parser/evaluation layer to the qualified Location Directory repository boundary.

It does **not** download GeoNames, activate a directory revision for user traffic, call Yandex, change Routes UI, or apply any production database migration.

## Why

The RU controlled evaluation proved that the official dataset is large enough to require bounded, auditable ingestion:

- 412,812 observed source lines;
- 201,299 accepted location seeds;
- 210,927 ignored unsupported features;
- 586 invalid target/source rows;
- 20,612 duplicate normalized primary-name groups;
- maximum observed normalized primary-name multiplicity: 405.

A direct single-pass "parse and write" flow is too weak because the source could change while an import is running and an operator could accidentally accept a larger or dirtier dataset than reviewed.

## Import protocol

The importer performs three passes over a caller-provided rewindable line source.

1. **Preflight**
   - runs the existing controlled ingestion evaluation;
   - computes a SHA-256 digest over normalized line framing;
   - verifies an explicit operator-approved accepted-record ceiling;
   - verifies an explicit operator-approved invalid-record budget;
   - applies a hard 1% invalid-row ratio ceiling to datasets with at least 1,000 rows.

2. **Source verification**
   - reopens the source;
   - recomputes SHA-256, line count and approximate byte count;
   - rejects the operation before persistence if any value differs from preflight.

3. **Persistence**
   - registers the immutable GeoNames directory revision;
   - parses the source again;
   - maps accepted seeds through the provider-neutral GeoNames directory adapter;
   - writes accepted locations through the qualified Location Directory repository contract;
   - uses bounded write concurrency;
   - verifies the third-pass digest and counters against preflight.

## Safety properties

- No source row can become an ARVELIS identity before the revision passes preflight.
- The importer never turns a GeoNames geonameId into the public ARVELIS location ID.
- ARVELIS identities stay stable across repeat imports through the repository identity mapping.
- Unsupported GeoNames features are ignored explicitly.
- Invalid rows are counted and constrained by an explicit operator budget.
- Large imports also have a hard invalid-ratio ceiling.
- Source mutation between preflight and verification fails before persistence.
- Source mutation during the persistence pass fails closed and the revision remains non-activated.
- Accepted-record count is bounded explicitly.
- Write concurrency is bounded to 1..8.
- AbortSignal is honored.
- No provider/network/UI activation is introduced.

## Retry behavior

The Location Directory repository is idempotent for the same immutable source revision and external source identity.

If persistence is interrupted after the revision is registered, the revision is still not automatically activated for user traffic. Re-running the exact same source/revision repairs/upserts the same records while preserving existing internal ARVELIS location IDs.

## Current verification

The dedicated smoke contract covers:

- successful synthetic controlled import;
- revision registration;
- persisted location resolution;
- repeat import with stable internal location ID;
- explicit invalid-row rejection before revision registration;
- source mutation rejection before persistence;
- accepted-record ceiling;
- pre-aborted import.

The smoke test intentionally uses synthetic data and does not claim that the full official RU dataset has been imported through this new persistence path.

## Production boundaries

Still not done:

- no automatic GeoNames download;
- no official RU dataset persistence run through this importer;
- no active-revision pointer/rollout mechanism;
- no background refresh job;
- no production PostgreSQL import;
- no Yandex station/location binding activation;
- no Routes UI activation;
- no merge to main;
- no production deployment or secret changes.

## Next safe pass after qualification

Run a controlled **real RU import qualification** against an isolated disposable database using the already reviewed official dataset/manifest, record elapsed time and persisted counts, and confirm representative lookups/ambiguity behavior. Production activation remains a separate decision.
