# Location Provider Strategy V1

Review date: 2026-09-16.

This checkpoint continues qualified Draft PR #42 and selects a source strategy for the next controlled location-directory ingestion experiment without claiming production readiness.

**GeoNames is selected for the next offline ingestion prototype. It is not yet qualified as the production ARVELIS location directory.**

## Source of truth

- Draft PR: #43.
- Branch: `feat/travel-location-provider-strategy-v1`.
- Base branch: `feat/travel-location-resolution-foundation-v1` / Draft PR #42.
- Exact qualified base: `9584932d07edde4063218dc7ce5002337e7f3dfc`.
- Qualified implementation HEAD before this documentation commit: `686b5f1ba27f4bb23a23e90429f52cb537daceb3`.
- Exact implementation CI: `35128162264` — SUCCESS.
- Existing `TravelLocationDirectory` contract remains provider-neutral.
- Existing transport/Yandex activation state is unchanged.

## Product and architecture requirement

ARVELIS needs a trusted location layer between free-form user text and provider-specific transport identifiers.

The source used for that layer must support the current product constraints:

- free user-facing service;
- no provider-code trust from browser/model input;
- replaceable providers;
- ability to operate in Russia without VPN where technically and legally possible;
- stable source identities and revision/provenance;
- city, station and airport coverage;
- explicit ambiguity rather than silent guessing;
- legal ability to keep the data needed by the product;
- bounded, reproducible import/update behavior;
- no requirement to make a third-party lookup for every user keystroke.

## Strategy review

### GeoNames — selected for the next controlled ingestion prototype

Official sources reviewed:

- `https://www.geonames.org/export/`
- `https://download.geonames.org/export/dump/`
- `https://www.geonames.org/export/codes.html`
- `https://www.geonames.org/export/geonames-search.html`

The downloadable GeoNames gazetteer is distributed under CC BY 4.0 with attribution. Country-specific extracts are available and can be processed locally rather than queried at runtime.

The standard dump includes fields useful to a neutral directory layer:

- stable external `geonameid`;
- primary/ascii/alternate names;
- latitude/longitude;
- feature class/code;
- country/admin hierarchy;
- population/elevation;
- IANA timezone;
- modification date.

Travel-relevant official feature codes include populated-place records and specific airport/rail/bus station records.

This makes GeoNames suitable for an **offline source-ingestion experiment** with no per-user runtime dependency and no new paid service.

### Public Nominatim — not selected as production-primary runtime resolver

Official policy reviewed:

`https://operations.osmfoundation.org/policies/nominatim/`

The public service has operational constraints that do not fit a primary autocomplete/location-directory dependency for ARVELIS:

- public usage is rate constrained;
- client-side autocomplete is prohibited;
- bulk/systematic use is restricted;
- service is best-effort;
- applications are expected to be able to switch services.

Self-hosted Nominatim remains a separate future architecture option, but it is not introduced in this slice and would require its own infrastructure, dataset, update and operational qualification.

### Yandex Geocoder — not selected as the canonical durable directory for the current free stage

Official Yandex geocoder/licensing documentation was reviewed on 2026-09-16.

Persistent storage/use has licensing constraints that move durable-storage scenarios into a paid licensing path. That conflicts with the current ARVELIS decision to keep this stage free and avoid adding a paid provider merely to establish the directory foundation.

This does not prohibit future use if product economics/licensing decisions change.

### Yandex Rasp `stations_list` — not used as a durable ARVELIS directory

The existing PR #41/#42 decision remains unchanged.

The Yandex Rasp API terms currently permit temporary caching for API-backed functionality but do not provide the legal basis used here for building a permanent first-party ARVELIS location database from API Data.

Therefore `stations_list` is not repurposed as the canonical location directory.

## Selected boundary for this slice

`server/travel/locationSources/geonamesSource.ts` is a source parser/manifest boundary only.

It deliberately does **not** implement:

- network download;
- ZIP extraction;
- persistence;
- search/indexing;
- `TravelLocationDirectory` runtime resolution;
- ARVELIS ID issuance;
- UI autocomplete;
- provider binding generation.

A GeoNames source record is normalized into `GeoNamesLocationSeedV1`.

The seed contains the external `geonameId`, but `geonameId` is explicitly **not** an ARVELIS `locationId`.

The future ingestion/persistence layer must mint and own an internal identity so that provider-neutrality survives a source replacement or source-record lifecycle change.

## Manifest contract

`GeoNamesDumpManifestV1` records the provenance required for a reproducible future import:

- contract version;
- source = `geonames`;
- ISO-style country code;
- exact official country archive URL;
- archive SHA-256;
- archive byte size;
- upstream modified date;
- canonical retrieval timestamp;
- CC BY 4.0 marker;
- GeoNames attribution URL.

The current source boundary accepts only the official HTTPS form:

`https://download.geonames.org/export/dump/<CC>.zip`

Arbitrary mirrors/hosts/query strings are rejected by the manifest validator.

No real manifest or checksum is committed yet because no real archive has been downloaded or qualified in this slice.

## TSV parser boundary

The official standard GeoNames dump contains 19 tab-separated columns. The parser requires exactly that shape.

Current hard bounds include:

- maximum source line: 32 KiB;
- maximum normalized search names: 128;
- bounded display/ascii/alternate-name input;
- valid source integer identity;
- latitude range -90..90;
- longitude range -180..180;
- non-negative population;
- validated admin-code syntax;
- validated IANA timezone;
- valid modification date;
- strict expected-country match.

Unsupported feature codes are ignored rather than silently widened into another ARVELIS location type.

Malformed records that target an allowed Travel feature fail closed.

## Conservative Travel feature mapping

This foundation intentionally starts narrower than the entire GeoNames taxonomy.

City/settlement candidates:

- `PPL`
- `PPLA`
- `PPLA2`
- `PPLA3`
- `PPLA4`
- `PPLA5`
- `PPLC`
- `PPLG`
- `PPLX`

Station candidates:

- `RSTN`
- `RSTP`
- `BUSTN`

Airport candidates:

- `AIRP`

This whitelist is **not yet a claim of sufficient Russian coverage**. A real-data coverage audit must measure missing/ambiguous locations before production selection.

## Search-name handling

The parser derives bounded search-name seeds from:

- primary name;
- ASCII name;
- alternate names.

Names are deduplicated with Unicode NFKC normalization plus locale-aware lowercase comparison, while preserving the original display strings.

The alias list is capped at 128 entries and reports `aliasesTruncated=true` when the source row contains more usable aliases.

This source-level list is not yet a public autocomplete ranking algorithm.

## Security and trust boundaries

The following invariants are mandatory:

- source `geonameId` never becomes trusted merely because it came from browser/model input;
- `GeoNamesLocationSeedV1` has no `locationId` field;
- provider-specific transport codes are absent from the GeoNames source seed;
- no source record directly authorizes a transport provider request;
- future ARVELIS IDs must be issued by a controlled server-side import/persistence process;
- import must verify a reviewed manifest/checksum before parsing;
- raw archives must never be committed to the repository;
- importer failures must not partially activate a new directory revision;
- attribution/license metadata must remain associated with an activated directory revision;
- no runtime external fetch is performed by the current source parser.

## Deterministic verification

`tests/geonames-location-source-smoke.ts` uses synthetic TSV rows only.

It covers:

- exact official country archive URL generation;
- manifest acceptance/rejection;
- host/query/hash/byte/license/attribution/timestamp constraints;
- plain-object manifest enforcement;
- city feature mapping;
- rail station/stop and bus station mapping;
- airport mapping;
- unsupported feature ignore behavior;
- country mismatch;
- malformed column count;
- newline and invalid source ID rejection;
- latitude/longitude bounds;
- population bounds;
- IANA timezone validation;
- modification-date validation;
- admin-code validation;
- alias hard cap and truncation marker;
- normalized alias deduplication;
- explicit absence of `locationId` and generic provider-code fields on the source seed.

No real GeoNames request/download occurs in CI.

## CI history

First PR-triggered run after adding the gate:

- `35128036642`: NOT QUALIFIED.
- Failure occurred while compiling the new synthetic smoke helper under `exactOptionalPropertyTypes`.
- Production `geonamesSource.ts` had not failed runtime validation; the helper assigned a `string | undefined` value into its synthetic TSV array.
- The helper was corrected with an explicit `value !== undefined` guard.
- No source validation, whitelist, security boundary or production timeout was weakened.

Implementation qualification run:

- `35128162264`: SUCCESS on `686b5f1ba27f4bb23a23e90429f52cb537daceb3`.

The run passed:

- dependency audit;
- TypeScript typecheck;
- plan orchestration policy;
- production transport search contract;
- Location Resolution Foundation;
- GeoNames location source contract;
- transport freshness/business policy;
- transport provider + Map + Legal foundations;
- AI/Knowledge and Retrieval regressions;
- Qwen runtime and llama.cpp regressions;
- Yandex Rasp adapter/runtime safety regressions;
- Trip server ownership/persistence;
- production server runtime build;
- real browser Travel happy-path;
- frontend build;
- full `npm run check`;
- PostgreSQL migrations/Trip ownership;
- pgvector Knowledge isolation/retrieval.

## Repository/toolchain impact

- No dependency added or upgraded.
- `package-lock.json` remains unchanged.
- No database migration added.
- No environment variable or secret added.
- No GeoNames archive or provider data committed.
- Existing Node/Replit versions remain unchanged.
- Existing Yandex activation flags remain unchanged and false.
- Qwen model/runtime/timeouts remain unchanged.

## Qualification status

- `LOCATION_PROVIDER_STRATEGY_DEFINED`: yes.
- `GEONAMES_SOURCE_BOUNDARY_READY`: yes.
- `GEONAMES_SYNTHETIC_CONTRACT_QUALIFIED`: yes.
- `GEONAMES_REAL_DATASET_DOWNLOADED`: no.
- `GEONAMES_REAL_DATASET_COVERAGE_AUDITED`: no.
- `GEONAMES_IMPORTER_READY`: no.
- `ARVELIS_LOCATION_IDS_ISSUED`: no.
- `LOCATION_DIRECTORY_PERSISTENCE_READY`: no.
- `TRAVEL_LOCATION_DIRECTORY_IMPLEMENTATION_READY`: no.
- `ROUTES_UI_LOCATION_RESOLUTION_ENABLED`: no.
- `PRODUCTION_LOCATION_DIRECTORY_READY`: no.
- `LIVE_LOCATION_RESOLUTION_VERIFIED`: no.
- `PRODUCTION_ACTIVATED`: no.

## Next safe slice

The next slice should be **GeoNames Controlled Ingestion Evaluation V1**, still separate from production activation.

It should only proceed with an explicitly bounded process:

1. download one reviewed country archive outside Git and record real source metadata/checksum;
2. verify archive size/checksum before extraction;
3. defend against ZIP/path/decompression abuse;
4. stream rather than load the entire dataset into memory;
5. parse into a staging representation;
6. measure city/station/airport coverage and invalid/ignored counts;
7. inspect ambiguity/duplicate-name cases relevant to Russian travel;
8. define internal ARVELIS ID issuance separately from `geonameId`;
9. define revision activation/rollback semantics;
10. only after measured acceptance, design persistence/search indexes and a `TravelLocationDirectory` adapter.

Do not connect this source directly to Routes UI or production transport search before those stages are qualified.
