import type { Pool, PoolClient } from 'pg';
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

const REVISION_SELECT = `
  source,
  revision,
  country_code,
  source_modified_date,
  retrieved_at,
  source_fingerprint,
  license,
  attribution_url
`;

type RevisionRow = {
  source: unknown;
  revision: unknown;
  country_code: unknown;
  source_modified_date: unknown;
  retrieved_at: unknown;
  source_fingerprint: unknown;
  license: unknown;
  attribution_url: unknown;
};

type SearchRow = {
  source: unknown;
  source_revision: unknown;
  external_source_id: unknown;
  location_id: unknown;
  display_name: unknown;
  location_type: unknown;
  country_code: unknown;
  region: unknown;
  timezone: unknown;
  latitude: unknown;
  longitude: unknown;
  population: unknown;
  matched_name: unknown;
  matched_primary: unknown;
  search_names: unknown;
};

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function dateOnly(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
}

function isoInstant(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function parseRevision(row: RevisionRow | undefined): LocationDirectoryRevisionV1 | null {
  if (!row) return null;
  const sourceModifiedDate = dateOnly(row.source_modified_date);
  const retrievedAt = isoInstant(row.retrieved_at);
  const candidate: unknown = {
    version: 1,
    source: row.source,
    revision: row.revision,
    countryCode: row.country_code,
    sourceModifiedDate,
    retrievedAt,
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

function parseSearchRow(row: SearchRow): LocationDirectorySearchHitV1 {
  const latitude = finiteNumber(row.latitude);
  const longitude = finiteNumber(row.longitude);
  const population = safeInteger(row.population);
  const searchNames = Array.isArray(row.search_names) && row.search_names.every((item) => typeof item === 'string')
    ? row.search_names
    : null;
  const region = row.region === null ? undefined : text(row.region) ?? undefined;
  const timezone = row.timezone === null ? undefined : text(row.timezone) ?? undefined;
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
    ...(region === undefined ? {} : { region }),
    ...(timezone === undefined ? {} : { timezone }),
    latitude,
    longitude,
    population,
  };
  if (!validateStoredLocationDirectoryRecordV1(record)) throw new Error('Invalid persisted location directory record');
  if (typeof row.matched_name !== 'string' || typeof row.matched_primary !== 'boolean') {
    throw new Error('Invalid persisted location directory match');
  }
  return {
    record,
    matchedName: row.matched_name,
    matchedPrimaryName: row.matched_primary,
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original transaction error.
  }
}

export class PostgresLocationDirectoryRepository implements LocationDirectoryRepository {
  constructor(private readonly pool: Pool) {}

  async putRevision(revision: LocationDirectoryRevisionV1): Promise<void> {
    if (!validateLocationDirectoryRevisionV1(revision)) throw new Error('Invalid location directory revision');
    await this.pool.query(`
      INSERT INTO travel_location_directory_revisions (
        source, revision, country_code, source_modified_date, retrieved_at,
        source_fingerprint, license, attribution_url
      ) VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6, $7, $8)
      ON CONFLICT (source, revision) DO NOTHING
    `, [
      revision.source,
      revision.revision,
      revision.countryCode,
      revision.sourceModifiedDate,
      revision.retrievedAt,
      revision.sourceFingerprint,
      revision.license,
      revision.attributionUrl,
    ]);

    const stored = await this.getRevision(revision.source, revision.revision);
    if (!stored || !sameRevision(stored, revision)) throw new Error('Location directory revision conflict');
  }

  async getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    const result = await this.pool.query<RevisionRow>(`
      SELECT ${REVISION_SELECT}
      FROM travel_location_directory_revisions
      WHERE source = $1 AND revision = $2
      LIMIT 1
    `, [source, revision]);
    const parsed = parseRevision(result.rows[0]);
    if (result.rows[0] && !parsed) throw new Error('Invalid persisted location directory revision');
    return parsed;
  }

  async upsertSourceLocation(
    location: LocationDirectorySourceLocationV1,
    createLocationId: () => string,
  ): Promise<StoredLocationDirectoryRecordV1> {
    if (!validateLocationDirectorySourceLocationV1(location)) throw new Error('Invalid location directory source record');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const revision = await client.query<{ present: number }>(`
        SELECT 1 AS present
        FROM travel_location_directory_revisions
        WHERE source = $1 AND revision = $2
        LIMIT 1
      `, [location.source, location.sourceRevision]);
      if (revision.rowCount !== 1) throw new Error('Location directory revision is not registered');

      const existing = await client.query<{ location_id: string }>(`
        SELECT location_id
        FROM travel_location_identities
        WHERE source = $1 AND external_source_id = $2
        LIMIT 1
      `, [location.source, location.externalSourceId]);

      let locationId = existing.rows[0]?.location_id;
      if (!locationId) {
        const proposed = createLocationId();
        const candidate: unknown = { ...location, locationId: proposed };
        if (!validateStoredLocationDirectoryRecordV1(candidate)) throw new Error('Invalid ARVELIS location identity');

        const inserted = await client.query<{ location_id: string }>(`
          INSERT INTO travel_location_identities (source, external_source_id, location_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (source, external_source_id) DO NOTHING
          RETURNING location_id
        `, [location.source, location.externalSourceId, proposed]);
        locationId = inserted.rows[0]?.location_id;
        if (!locationId) {
          const concurrent = await client.query<{ location_id: string }>(`
            SELECT location_id
            FROM travel_location_identities
            WHERE source = $1 AND external_source_id = $2
            LIMIT 1
          `, [location.source, location.externalSourceId]);
          locationId = concurrent.rows[0]?.location_id;
        }
      }
      if (!locationId) throw new Error('Location directory identity could not be established');

      const stored: StoredLocationDirectoryRecordV1 = { ...structuredClone(location), locationId };
      if (!validateStoredLocationDirectoryRecordV1(stored)) throw new Error('Invalid stored location directory record');

      await client.query(`
        INSERT INTO travel_location_records (
          source, source_revision, external_source_id, location_id, display_name, location_type,
          country_code, region, timezone, latitude, longitude, population
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (source, source_revision, external_source_id) DO UPDATE SET
          location_id = EXCLUDED.location_id,
          display_name = EXCLUDED.display_name,
          location_type = EXCLUDED.location_type,
          country_code = EXCLUDED.country_code,
          region = EXCLUDED.region,
          timezone = EXCLUDED.timezone,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          population = EXCLUDED.population
      `, [
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
      ]);

      await client.query(`
        DELETE FROM travel_location_names
        WHERE source = $1 AND source_revision = $2 AND external_source_id = $3
      `, [stored.source, stored.sourceRevision, stored.externalSourceId]);

      const primaryName = normalizeLocationDirectoryName(stored.displayName);
      for (const searchName of stored.searchNames) {
        const normalizedName = normalizeLocationDirectoryName(searchName);
        await client.query(`
          INSERT INTO travel_location_names (
            source, source_revision, external_source_id, normalized_name, search_name, is_primary
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          stored.source,
          stored.sourceRevision,
          stored.externalSourceId,
          normalizedName,
          searchName,
          normalizedName === primaryName,
        ]);
      }

      await client.query('COMMIT');
      return structuredClone(stored);
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async searchExact(lookup: LocationDirectoryLookupV1): Promise<LocationDirectorySearchHitV1[]> {
    if (!validateLocationDirectoryLookupV1(lookup)) throw new Error('Invalid location directory lookup');

    const params: unknown[] = [lookup.source, lookup.sourceRevision, lookup.normalizedLabel];
    const conditions = [
      'matched.source = $1',
      'matched.source_revision = $2',
      'matched.normalized_name = $3',
    ];
    if (lookup.countryCode) {
      params.push(lookup.countryCode);
      conditions.push(`record.country_code = $${params.length}`);
    }
    if (lookup.types) {
      params.push(lookup.types);
      conditions.push(`record.location_type = ANY($${params.length}::text[])`);
    }
    params.push(lookup.maxMatches + 1);
    const limitParameter = `$${params.length}`;

    const result = await this.pool.query<SearchRow>(`
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
        matched.is_primary AS matched_primary,
        array_agg(all_names.search_name ORDER BY all_names.is_primary DESC, all_names.normalized_name ASC) AS search_names
      FROM travel_location_names AS matched
      JOIN travel_location_records AS record
        ON record.source = matched.source
        AND record.source_revision = matched.source_revision
        AND record.external_source_id = matched.external_source_id
      JOIN travel_location_names AS all_names
        ON all_names.source = record.source
        AND all_names.source_revision = record.source_revision
        AND all_names.external_source_id = record.external_source_id
      WHERE ${conditions.join('\n        AND ')}
      GROUP BY
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
        matched.search_name,
        matched.is_primary
      ORDER BY record.external_source_id ASC
      LIMIT ${limitParameter}
    `, params);

    if (result.rows.length > lookup.maxMatches) throw new Error('Location directory lookup exceeds bounded match limit');
    return result.rows.map(parseSearchRow);
  }
}
