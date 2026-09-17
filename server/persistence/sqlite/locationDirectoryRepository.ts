import type { DatabaseSync } from 'node:sqlite';
import {
  normalizeLocationDirectoryName,
  validateLocationDirectoryLookupV1,
  validateLocationDirectoryRevisionV1,
  validateLocationDirectorySourceLocationV1,
  validateStoredLocationDirectoryRecordV1,
  type LocationDirectoryLookupV1,
  type LocationDirectoryRepository,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySearchHitV1,
  type LocationDirectorySourceLocationV1,
  type LocationDirectorySourceV1,
  type StoredLocationDirectoryRecordV1,
} from '../../travel/locationDirectoryFoundation';
import { inSqliteTransaction } from './database';

type RevisionRow = {
  source?: unknown;
  revision?: unknown;
  country_code?: unknown;
  source_modified_date?: unknown;
  retrieved_at?: unknown;
  source_fingerprint?: unknown;
  license?: unknown;
  attribution_url?: unknown;
};

type MatchRow = {
  source?: unknown;
  source_revision?: unknown;
  external_source_id?: unknown;
  location_id?: unknown;
  display_name?: unknown;
  location_type?: unknown;
  country_code?: unknown;
  region?: unknown;
  timezone?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  population?: unknown;
  matched_name?: unknown;
  matched_primary?: unknown;
};

function parseRevision(row: RevisionRow | undefined): LocationDirectoryRevisionV1 | null {
  if (!row) return null;
  const candidate: unknown = {
    version: 1,
    source: row.source,
    revision: row.revision,
    countryCode: row.country_code,
    sourceModifiedDate: row.source_modified_date,
    retrievedAt: row.retrieved_at,
    sourceFingerprint: row.source_fingerprint,
    license: row.license,
    attributionUrl: row.attribution_url,
  };
  return validateLocationDirectoryRevisionV1(candidate) ? candidate : null;
}

function sameRevision(left: LocationDirectoryRevisionV1, right: LocationDirectoryRevisionV1): boolean {
  return left.version === right.version
    && left.source === right.source
    && left.revision === right.revision
    && left.countryCode === right.countryCode
    && left.sourceModifiedDate === right.sourceModifiedDate
    && left.retrievedAt === right.retrievedAt
    && left.sourceFingerprint === right.sourceFingerprint
    && left.license === right.license
    && left.attributionUrl === right.attributionUrl;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

export class SqliteLocationDirectoryRepository implements LocationDirectoryRepository {
  constructor(private readonly database: DatabaseSync) {}

  async putRevision(revision: LocationDirectoryRevisionV1): Promise<void> {
    if (!validateLocationDirectoryRevisionV1(revision)) throw new Error('Invalid location directory revision');
    this.database.prepare(`
      INSERT OR IGNORE INTO travel_location_directory_revisions (
        source, revision, country_code, source_modified_date, retrieved_at,
        source_fingerprint, license, attribution_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revision.source,
      revision.revision,
      revision.countryCode,
      revision.sourceModifiedDate,
      revision.retrievedAt,
      revision.sourceFingerprint,
      revision.license,
      revision.attributionUrl,
    );

    const stored = await this.getRevision(revision.source, revision.revision);
    if (!stored || !sameRevision(stored, revision)) throw new Error('Location directory revision conflict');
  }

  async getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    const row = this.database.prepare(`
      SELECT
        source, revision, country_code, source_modified_date, retrieved_at,
        source_fingerprint, license, attribution_url
      FROM travel_location_directory_revisions
      WHERE source = ? AND revision = ?
      LIMIT 1
    `).get(source, revision) as RevisionRow | undefined;
    const parsed = parseRevision(row);
    if (row && !parsed) throw new Error('Invalid persisted location directory revision');
    return parsed;
  }

  async upsertSourceLocation(
    location: LocationDirectorySourceLocationV1,
    createLocationId: () => string,
  ): Promise<StoredLocationDirectoryRecordV1> {
    if (!validateLocationDirectorySourceLocationV1(location)) throw new Error('Invalid location directory source record');

    return inSqliteTransaction(this.database, () => {
      const revision = this.database.prepare(`
        SELECT 1 AS present
        FROM travel_location_directory_revisions
        WHERE source = ? AND revision = ?
        LIMIT 1
      `).get(location.source, location.sourceRevision) as { present?: unknown } | undefined;
      if (revision?.present !== 1) throw new Error('Location directory revision is not registered');

      const existing = this.database.prepare(`
        SELECT location_id
        FROM travel_location_identities
        WHERE source = ? AND external_source_id = ?
        LIMIT 1
      `).get(location.source, location.externalSourceId) as { location_id?: unknown } | undefined;

      let locationId = typeof existing?.location_id === 'string' ? existing.location_id : undefined;
      if (!locationId) {
        const proposed = createLocationId();
        const candidate: unknown = { ...location, locationId: proposed };
        if (!validateStoredLocationDirectoryRecordV1(candidate)) throw new Error('Invalid ARVELIS location identity');
        this.database.prepare(`
          INSERT INTO travel_location_identities (source, external_source_id, location_id, created_at)
          VALUES (?, ?, ?, ?)
        `).run(location.source, location.externalSourceId, proposed, Date.now());
        locationId = proposed;
      }

      const stored: StoredLocationDirectoryRecordV1 = { ...structuredClone(location), locationId };
      if (!validateStoredLocationDirectoryRecordV1(stored)) throw new Error('Invalid stored location directory record');

      this.database.prepare(`
        INSERT INTO travel_location_records (
          source, source_revision, external_source_id, location_id, display_name, location_type,
          country_code, region, timezone, latitude, longitude, population
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, source_revision, external_source_id) DO UPDATE SET
          location_id = excluded.location_id,
          display_name = excluded.display_name,
          location_type = excluded.location_type,
          country_code = excluded.country_code,
          region = excluded.region,
          timezone = excluded.timezone,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          population = excluded.population
      `).run(
        stored.source,
        stored.sourceRevision,
        stored.externalSourceId,
        stored.locationId,
        stored.displayName,
        stored.type,
        stored.countryCode,
        stored.region ?? null,
        stored.timezone ?? null,
        stored.latitude,
        stored.longitude,
        stored.population,
      );

      this.database.prepare(`
        DELETE FROM travel_location_names
        WHERE source = ? AND source_revision = ? AND external_source_id = ?
      `).run(stored.source, stored.sourceRevision, stored.externalSourceId);

      const primaryName = normalizeLocationDirectoryName(stored.displayName);
      const insertName = this.database.prepare(`
        INSERT INTO travel_location_names (
          source, source_revision, external_source_id, normalized_name, search_name, is_primary
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const searchName of stored.searchNames) {
        const normalizedName = normalizeLocationDirectoryName(searchName);
        insertName.run(
          stored.source,
          stored.sourceRevision,
          stored.externalSourceId,
          normalizedName,
          searchName,
          normalizedName === primaryName ? 1 : 0,
        );
      }

      return structuredClone(stored);
    });
  }

  async searchExact(lookup: LocationDirectoryLookupV1): Promise<LocationDirectorySearchHitV1[]> {
    if (!validateLocationDirectoryLookupV1(lookup)) throw new Error('Invalid location directory lookup');

    const conditions = [
      'matched.source = ?',
      'matched.source_revision = ?',
      'matched.normalized_name = ?',
    ];
    const params: Array<string | number | null> = [lookup.source, lookup.sourceRevision, lookup.normalizedLabel];
    if (lookup.countryCode) {
      conditions.push('record.country_code = ?');
      params.push(lookup.countryCode);
    }
    if (lookup.types) {
      conditions.push(`record.location_type IN (${lookup.types.map(() => '?').join(', ')})`);
      params.push(...lookup.types);
    }
    params.push(lookup.maxMatches + 1);

    const rows = this.database.prepare(`
      SELECT
        record.source,
        record.source_revision,
        record.external_source_id,
        record.location_id,
        record.display_name,
        record.location_type,
        record.country_code,
        record.region,
        record.timezone,
        record.latitude,
        record.longitude,
        record.population,
        matched.search_name AS matched_name,
        matched.is_primary AS matched_primary
      FROM travel_location_names AS matched
      JOIN travel_location_records AS record
        ON record.source = matched.source
        AND record.source_revision = matched.source_revision
        AND record.external_source_id = matched.external_source_id
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY record.external_source_id ASC
      LIMIT ?
    `).all(...params) as MatchRow[];

    if (rows.length > lookup.maxMatches) throw new Error('Location directory lookup exceeds bounded match limit');

    return rows.map((row) => {
      if (typeof row.source !== 'string'
        || typeof row.source_revision !== 'string'
        || typeof row.external_source_id !== 'string'
        || typeof row.location_id !== 'string'
        || typeof row.display_name !== 'string'
        || typeof row.location_type !== 'string'
        || typeof row.country_code !== 'string'
        || (row.region !== null && row.region !== undefined && typeof row.region !== 'string')
        || (row.timezone !== null && row.timezone !== undefined && typeof row.timezone !== 'string')
        || typeof row.matched_name !== 'string'
        || (row.matched_primary !== 0 && row.matched_primary !== 1)) {
        throw new Error('Invalid persisted location directory match');
      }
      const latitude = numberValue(row.latitude);
      const longitude = numberValue(row.longitude);
      const population = numberValue(row.population);
      if (latitude === null || longitude === null || population === null || !Number.isSafeInteger(population)) {
        throw new Error('Invalid persisted location directory numeric values');
      }

      const nameRows = this.database.prepare(`
        SELECT search_name
        FROM travel_location_names
        WHERE source = ? AND source_revision = ? AND external_source_id = ?
        ORDER BY is_primary DESC, normalized_name ASC
      `).all(row.source, row.source_revision, row.external_source_id) as Array<{ search_name?: unknown }>;
      const searchNames = nameRows.map((nameRow) => {
        if (typeof nameRow.search_name !== 'string') throw new Error('Invalid persisted location directory name');
        return nameRow.search_name;
      });

      const record: unknown = {
        version: 1,
        source: row.source,
        sourceRevision: row.source_revision,
        externalSourceId: row.external_source_id,
        locationId: row.location_id,
        displayName: row.display_name,
        searchNames,
        type: row.location_type,
        countryCode: row.country_code,
        ...(typeof row.region === 'string' ? { region: row.region } : {}),
        ...(typeof row.timezone === 'string' ? { timezone: row.timezone } : {}),
        latitude,
        longitude,
        population,
      };
      if (!validateStoredLocationDirectoryRecordV1(record)) throw new Error('Invalid persisted location directory record');
      return {
        record,
        matchedName: row.matched_name,
        matchedPrimaryName: row.matched_primary === 1,
      };
    });
  }
}
