# GeoNames Controlled Ingestion Evaluation V1

Status: QUALIFIED EVALUATION EVIDENCE — NOT PRODUCTION ACTIVATION
Date: 2026-09-16
Scope: Draft PR #44, stacked on qualified Draft PR #43.

## Purpose

Validate the controlled offline-ingestion characteristics of the official GeoNames Russia country dump before approving any durable ARVELIS location-directory persistence, indexing, ranking or user-facing location resolution.

This slice evaluates source shape, bounded ingestion behavior, conservative Travel-relevant coverage and ambiguity. It does not create a production directory.

## Official source and license

Reviewed official source:

- `https://download.geonames.org/export/dump/`
- `https://download.geonames.org/export/dump/readme.txt`
- evaluated archive: `https://download.geonames.org/export/dump/RU.zip`

The GeoNames dump readme states CC BY 4.0 licensing, UTF-8 tab-delimited records and country extracts in `XX.zip` form. Attribution remains required for any later product use.

Raw GeoNames archive/TSV content was not committed to the repository and was not uploaded as a GitHub Actions artifact.

## Evidence procedure

Deterministic evaluator qualification:

- implementation HEAD before live evidence: `89b4fa34cee0b901427fa15f6f0bffcf0270512f`;
- CI run `35129389569`: SUCCESS;
- synthetic GeoNames source and controlled-ingestion gates: PASS;
- no network dependency in the deterministic gates.

First ephemeral evidence attempt:

- run `35145837499`;
- evidence job failed closed with `unexpected_zip_members` because the harness incorrectly assumed the official archive contained exactly one member;
- no raw data was persisted or uploaded;
- production parser/evaluator behavior was not weakened.

The harness was corrected to validate a small bounded set of safe top-level ZIP members, require exactly one `RU.txt`, reject paths/directories/symlinks, bound compressed/uncompressed sizes and extract only `RU.txt`.

Successful ephemeral evidence run:

- evidence HEAD: `509457b6e3cb44d26a4b7e0c5c0e1e5cea59bf40`;
- CI run `35145985849`: SUCCESS;
- `validate`: SUCCESS;
- `postgres-compat`: SUCCESS;
- `geonames-real-data-evidence`: SUCCESS.

Evidence harness controls:

- exact HTTPS URL, redirects rejected;
- archive hard cap: 32 MiB;
- maximum 10 ZIP members;
- members must be safe top-level regular entries;
- path separators/directories/symlinks rejected;
- maximum member size: 512 MiB;
- maximum aggregate uncompressed ZIP size: 520 MiB;
- exactly one non-empty `RU.txt` required;
- only `RU.txt` extracted;
- extraction directory ephemeral and deleted at job end;
- no Actions artifact upload.

The temporary network evidence job is removed from the permanent CI after this evidence was captured. Final qualification returns to deterministic/offline CI only.

## Final acceptance gate

The evidence run alone does not qualify the slice. After removing the temporary network job, the final branch HEAD must pass the normal PR CI again with only deterministic/offline repository gates plus the existing PostgreSQL compatibility job. The PR description may record `QUALIFIED` only after that exact-head run succeeds.

## Captured provenance

Official archive evidence from run `35145985849`:

- source: `geonames`;
- country: `RU`;
- source modified date: `2026-09-16`;
- archive bytes: `15,248,292`;
- archive SHA-256: `8017a6bc4048bb6f929ef88f5ec0e7178d48bef29d40db1ae61fd250daff4360`;
- archive member count: `2`;
- `readme.txt`: `8,843` bytes;
- `RU.txt`: `61,832,495` bytes;
- evaluated member: `RU.txt`;
- raw data persisted after job: no;
- repository artifact uploaded: no.

The SHA identifies only the evaluated 2026-09-16 snapshot. A future ingestion must capture and validate its own source revision/provenance rather than assuming this hash is permanent.

## Aggregate RU coverage evidence

The strict PR #43 parser evaluated `412,812` rows (`61,832,495` approximate TSV bytes).

Outcome totals:

- accepted: `201,299` (`48.763%`);
- ignored because the feature is outside the conservative Travel whitelist: `210,927` (`51.095%`);
- invalid target rows rejected fail closed: `586` (`0.142%`).

Accepted rows by ARVELIS candidate type:

- city/settlement: `191,576` (`95.170%` of accepted);
- rail/bus station: `9,427` (`4.683%`);
- airport: `296` (`0.147%`).

Accepted rows by GeoNames feature code:

| Feature | Accepted |
| --- | ---: |
| `PPL` | 186,711 |
| `PPLA` | 80 |
| `PPLA2` | 1,801 |
| `PPLA3` | 29 |
| `PPLA4` | 2 |
| `PPLC` | 1 |
| `PPLX` | 2,952 |
| `RSTN` | 5,532 |
| `RSTP` | 3,894 |
| `BUSTN` | 1 |
| `AIRP` | 296 |

Alias-list hard bound was not hit in this snapshot (`aliasesTruncated = 0`).

Accepted modification dates ranged from `1994-04-09` through `2026-09-12`. Therefore an individual GeoNames row's modification date must not be treated as a global freshness guarantee. Future directory revisions need snapshot-level provenance independently of row dates.

## Invalid-row evidence

`586` Travel-target rows failed strict validation and were excluded. The bounded sample emitted only line numbers plus `invalid_target_record`; raw row contents were not emitted by the evaluator report.

This is not a reason to relax validation. A later diagnostics slice may classify aggregate rejection reasons if needed, but malformed/unsupported target records remain fail closed until explicitly reviewed.

## Ambiguity evidence

Real probes demonstrate that a text label is not a trustworthy unique location identity:

- `Москва` produced multiple populated-place candidates; the English `Moscow` probe was narrower but does not make arbitrary alias matching safe.
- `Казань` produced multiple populated-place candidates; `Kazan` also remained non-unique.
- `Сочи`/`Sochi` covered city, railway-station and airport records.
- `Novosibirsk` covered the city and Tolmachevo Airport.
- `Vladivostok` covered city, railway station and airport.
- `Калининград`/`Kaliningrad` demonstrated alias/historical-name collision in addition to the intended city and airport records.

Across all accepted rows:

- duplicate normalized primary-name groups: `20,612`;
- maximum primary-name multiplicity: `405`.

Consequences:

1. ARVELIS must not convert arbitrary user/model text directly into a trusted location identity.
2. Name matching alone must never auto-authorize `transport.search`.
3. Multiple viable candidates must remain `ambiguous` unless the user explicitly selects one or a separately approved deterministic disambiguation policy has sufficient trusted context.
4. Candidate ranking may assist presentation, but ranking is not identity proof.
5. External `geonameId` remains source provenance and must not be aliased directly to an `arvelis:*` identity.

## Architecture decision

The real RU snapshot provides enough Travel-relevant coverage to justify the **next controlled internal-directory prototype**.

It does not establish production readiness.

Qualified decisions:

- `GEONAMES_RU_CONTROLLED_EVALUATION_COMPLETE`: **yes**;
- `GEONAMES_RU_EVIDENCE_QUALIFIED`: **yes**;
- `GEONAMES_SOURCE_BOUNDARY_READY`: **yes**;
- `GEONAMES_COVERAGE_SUPPORTS_NEXT_INTERNAL_DIRECTORY_PROTOTYPE`: **yes**;
- `AUTO_RESOLUTION_BY_NAME_APPROVED`: **no**;
- `GEONAMES_PRODUCTION_DIRECTORY_READY`: **no**;
- `ARVELIS_LOCATION_ID_PERSISTENCE_READY`: **no**;
- `TRAVEL_LOCATION_DIRECTORY_IMPLEMENTATION_READY`: **no**;
- `ROUTES_UI_LOCATION_RESOLUTION_ENABLED`: **no**;
- `PRODUCTION_ACTIVATED`: **no**.

## Non-goals preserved

This slice does not introduce:

- raw GeoNames datasets into Git;
- a scheduled or runtime GeoNames download;
- a database migration or persistent location index;
- automatic ARVELIS ID issuance;
- `geonameId -> arvelis:*` aliasing;
- a production `TravelLocationDirectory` implementation;
- UI autocomplete or Routes search activation;
- Yandex Rasp production activation;
- Qwen/tool-routing changes;
- timeout increases or security-gate weakening;
- deployment or merge.

## Next safe slice

Build **Location Directory Persistence & Ranking Foundation V1** as a separate stacked slice.

Before production activation it should define and qualify:

- provider-neutral durable `arvelis:*` location identity issuance;
- immutable source provenance/revision records;
- unique constraints for `(source, externalSourceId, sourceRevision)` or an equivalent reviewed model;
- separation of canonical location records from source names/aliases;
- bounded normalized-name search indexes;
- deterministic ranking inputs such as requested type, country/admin context and population while preserving ambiguity;
- explicit source-revision refresh/update semantics;
- no browser/model access to external provider IDs as trusted identities;
- offline/synthetic repository tests before any real migration is approved.
