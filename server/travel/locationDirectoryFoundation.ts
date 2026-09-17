import { randomUUID } from 'node:crypto';
import type {
  LocationResolutionQueryV1,
  TravelLocationCandidateV1,
  TravelLocationType,
} from '../../src/travel/locationResolution';
import type {
  LocationDirectoryContext,
  TravelLocationDirectory,
} from './locationResolutionService';

export const LOCATION_DIRECTORY_FOUNDATION_VERSION = 1 as const;
export const MAX_LOCATION_DIRECTORY_SEARCH_NAMES = 128;
export const MAX_LOCATION_DIRECTORY_LOOKUP_MATCHES = 512;

export type LocationDirectorySourceV1 = 'geonames';

export type LocationDirectoryRevisionV1 = {
  version: 1;
  source: LocationDirectorySourceV1;
  revision: string;
  countryCode: string;
  sourceModifiedDate: string;
  retrievedAt: string;
  sourceFingerprint: string;
  license: string;
  attributionUrl: string;
};

export type LocationDirectorySourceLocationV1 = {
  version: 1;
  source: LocationDirectorySourceV1;
  sourceRevision: string;
  externalSourceId: string;
  displayName: string;
  searchNames: string[];
  type: TravelLocationType;
  countryCode: string;
  region?: string;
  timezone?: string;
  latitude: number;
  longitude: number;
  population: number;
};

export type StoredLocationDirectoryRecordV1 = LocationDirectorySourceLocationV1 & {
  locationId: string;
};

export type LocationDirectorySearchHitV1 = {
  record: StoredLocationDirectoryRecordV1;
  matchedName: string;
  matchedPrimaryName: boolean;
};

export type LocationDirectoryLookupV1 = {
  source: LocationDirectorySourceV1;
  sourceRevision: string;
  normalizedLabel: string;
  countryCode?: string;
  types?: TravelLocationType[];
  maxMatches: number;
};

export interface LocationDirectoryRepository {
  putRevision(revision: LocationDirectoryRevisionV1): Promise<void>;
  getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null>;
  upsertSourceLocation(
    location: LocationDirectorySourceLocationV1,
    createLocationId: () => string,
  ): Promise<StoredLocationDirectoryRecordV1>;
  searchExact(lookup: LocationDirectoryLookupV1): Promise<LocationDirectorySearchHitV1[]>;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validIsoInstant(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTimezone(value: string): boolean {
  if (value.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validSource(value: unknown): value is LocationDirectorySourceV1 {
  return value === 'geonames';
}

function validTravelType(value: unknown): value is TravelLocationType {
  return value === 'city' || value === 'station' || value === 'airport';
}

function validRevisionToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 128
    && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value);
}

function validArvelisLocationId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 96
    && /^arvelis:location:[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

export function normalizeLocationDirectoryName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
}

export function validateLocationDirectoryRevisionV1(value: unknown): value is LocationDirectoryRevisionV1 {
  if (!plainRecord(value)) return false;
  if (!Object.keys(value).every((key) => [
    'version', 'source', 'revision', 'countryCode', 'sourceModifiedDate', 'retrievedAt',
    'sourceFingerprint', 'license', 'attributionUrl',
  ].includes(key))) return false;
  return value.version === LOCATION_DIRECTORY_FOUNDATION_VERSION
    && validSource(value.source)
    && validRevisionToken(value.revision)
    && typeof value.countryCode === 'string'
    && /^[A-Z]{2}$/.test(value.countryCode)
    && typeof value.sourceModifiedDate === 'string'
    && validDateOnly(value.sourceModifiedDate)
    && typeof value.retrievedAt === 'string'
    && validIsoInstant(value.retrievedAt)
    && typeof value.sourceFingerprint === 'string'
    && /^[a-f0-9]{64}$/.test(value.sourceFingerprint)
    && validText(value.license, 80)
    && validText(value.attributionUrl, 240)
    && URL.canParse(value.attributionUrl)
    && value.sourceModifiedDate <= value.retrievedAt.slice(0, 10);
}

export function validateLocationDirectorySourceLocationV1(value: unknown): value is LocationDirectorySourceLocationV1 {
  if (!plainRecord(value)) return false;
  if (!Object.keys(value).every((key) => [
    'version', 'source', 'sourceRevision', 'externalSourceId', 'displayName', 'searchNames',
    'type', 'countryCode', 'region', 'timezone', 'latitude', 'longitude', 'population',
  ].includes(key))) return false;
  if (value.version !== LOCATION_DIRECTORY_FOUNDATION_VERSION
    || !validSource(value.source)
    || !validRevisionToken(value.sourceRevision)
    || !validText(value.externalSourceId, 120)
    || !validText(value.displayName, 200)
    || !validTravelType(value.type)
    || typeof value.countryCode !== 'string'
    || !/^[A-Z]{2}$/.test(value.countryCode)
    || (value.region !== undefined && !validText(value.region, 120))
    || (value.timezone !== undefined && (typeof value.timezone !== 'string' || !validTimezone(value.timezone)))
    || typeof value.latitude !== 'number'
    || !Number.isFinite(value.latitude)
    || value.latitude < -90
    || value.latitude > 90
    || typeof value.longitude !== 'number'
    || !Number.isFinite(value.longitude)
    || value.longitude < -180
    || value.longitude > 180
    || typeof value.population !== 'number'
    || !Number.isSafeInteger(value.population)
    || value.population < 0
    || !Array.isArray(value.searchNames)
    || value.searchNames.length < 1
    || value.searchNames.length > MAX_LOCATION_DIRECTORY_SEARCH_NAMES) {
    return false;
  }

  const normalized = new Set<string>();
  for (const name of value.searchNames) {
    if (!validText(name, 400)) return false;
    const key = normalizeLocationDirectoryName(name);
    if (!key || normalized.has(key)) return false;
    normalized.add(key);
  }
  return normalized.has(normalizeLocationDirectoryName(value.displayName));
}

export function validateStoredLocationDirectoryRecordV1(value: unknown): value is StoredLocationDirectoryRecordV1 {
  if (!plainRecord(value) || !validArvelisLocationId(value.locationId)) return false;
  const { locationId: _locationId, ...sourceLocation } = value;
  return validateLocationDirectorySourceLocationV1(sourceLocation);
}

function cloneRevision(value: LocationDirectoryRevisionV1): LocationDirectoryRevisionV1 {
  return structuredClone(value);
}

function cloneRecord(value: StoredLocationDirectoryRecordV1): StoredLocationDirectoryRecordV1 {
  return structuredClone(value);
}

function revisionKey(source: LocationDirectorySourceV1, revision: string): string {
  return `${source}\u0000${revision}`;
}

function identityKey(source: LocationDirectorySourceV1, externalSourceId: string): string {
  return `${source}\u0000${externalSourceId}`;
}

function recordKey(source: LocationDirectorySourceV1, revision: string, externalSourceId: string): string {
  return `${source}\u0000${revision}\u0000${externalSourceId}`;
}

/**
 * Deterministic semantics reference implementation for repository qualification.
 * It is intentionally process-local and is not a production persistence adapter.
 */
export class InMemoryLocationDirectoryRepository implements LocationDirectoryRepository {
  readonly #revisions = new Map<string, LocationDirectoryRevisionV1>();
  readonly #identities = new Map<string, string>();
  readonly #records = new Map<string, StoredLocationDirectoryRecordV1>();

  async putRevision(revision: LocationDirectoryRevisionV1): Promise<void> {
    if (!validateLocationDirectoryRevisionV1(revision)) throw new Error('Invalid location directory revision');
    const key = revisionKey(revision.source, revision.revision);
    const existing = this.#revisions.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(revision)) {
      throw new Error('Location directory revision conflict');
    }
    this.#revisions.set(key, cloneRevision(revision));
  }

  async getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    if (!validSource(source) || !validRevisionToken(revision)) return null;
    const value = this.#revisions.get(revisionKey(source, revision));
    return value ? cloneRevision(value) : null;
  }

  async upsertSourceLocation(
    location: LocationDirectorySourceLocationV1,
    createLocationId: () => string,
  ): Promise<StoredLocationDirectoryRecordV1> {
    if (!validateLocationDirectorySourceLocationV1(location)) throw new Error('Invalid location directory source record');
    if (!this.#revisions.has(revisionKey(location.source, location.sourceRevision))) {
      throw new Error('Location directory revision is not registered');
    }

    const sourceIdentityKey = identityKey(location.source, location.externalSourceId);
    let locationId = this.#identities.get(sourceIdentityKey);
    if (!locationId) {
      const proposed = createLocationId();
      if (!validArvelisLocationId(proposed)) throw new Error('Invalid ARVELIS location identity');
      if ([...this.#identities.values()].includes(proposed)) throw new Error('ARVELIS location identity collision');
      locationId = proposed;
      this.#identities.set(sourceIdentityKey, locationId);
    }

    const record: StoredLocationDirectoryRecordV1 = { ...structuredClone(location), locationId };
    this.#records.set(recordKey(location.source, location.sourceRevision, location.externalSourceId), record);
    return cloneRecord(record);
  }

  async searchExact(lookup: LocationDirectoryLookupV1): Promise<LocationDirectorySearchHitV1[]> {
    if (!validSource(lookup.source)
      || !validRevisionToken(lookup.sourceRevision)
      || !lookup.normalizedLabel
      || lookup.normalizedLabel !== normalizeLocationDirectoryName(lookup.normalizedLabel)
      || lookup.normalizedLabel.length > 400
      || (lookup.countryCode !== undefined && !/^[A-Z]{2}$/.test(lookup.countryCode))
      || (lookup.types !== undefined && (lookup.types.length < 1 || lookup.types.some((type) => !validTravelType(type))))
      || !Number.isInteger(lookup.maxMatches)
      || lookup.maxMatches < 2
      || lookup.maxMatches > MAX_LOCATION_DIRECTORY_LOOKUP_MATCHES) {
      throw new Error('Invalid location directory lookup');
    }

    const typeSet = lookup.types ? new Set(lookup.types) : null;
    const matches: LocationDirectorySearchHitV1[] = [];
    for (const record of this.#records.values()) {
      if (record.source !== lookup.source || record.sourceRevision !== lookup.sourceRevision) continue;
      if (lookup.countryCode && record.countryCode !== lookup.countryCode) continue;
      if (typeSet && !typeSet.has(record.type)) continue;
      const matchedName = record.searchNames.find((name) => normalizeLocationDirectoryName(name) === lookup.normalizedLabel);
      if (!matchedName) continue;
      matches.push({
        record: cloneRecord(record),
        matchedName,
        matchedPrimaryName: normalizeLocationDirectoryName(record.displayName) === lookup.normalizedLabel,
      });
      if (matches.length >= lookup.maxMatches) break;
    }
    return matches;
  }
}

export function createArvelisLocationId(): string {
  return `arvelis:location:${randomUUID()}`;
}

export type LocationDirectoryIngestionOptions = {
  locationIdFactory?: () => string;
};

export class LocationDirectoryIngestionService {
  readonly #repository: LocationDirectoryRepository;
  readonly #locationIdFactory: () => string;

  constructor(repository: LocationDirectoryRepository, options: LocationDirectoryIngestionOptions = {}) {
    this.#repository = repository;
    this.#locationIdFactory = options.locationIdFactory ?? createArvelisLocationId;
  }

  async registerRevision(revision: LocationDirectoryRevisionV1): Promise<void> {
    await this.#repository.putRevision(revision);
  }

  async upsert(location: LocationDirectorySourceLocationV1): Promise<StoredLocationDirectoryRecordV1> {
    return this.#repository.upsertSourceLocation(location, this.#locationIdFactory);
  }
}

function typePreference(query: LocationResolutionQueryV1, type: TravelLocationType): number {
  if (!query.types) return 0;
  const index = query.types.indexOf(type);
  return index === -1 ? Number.NEGATIVE_INFINITY : query.types.length - index;
}

function regionMatch(query: LocationResolutionQueryV1, record: StoredLocationDirectoryRecordV1): number {
  if (!query.region || !record.region) return 0;
  return normalizeLocationDirectoryName(query.region) === normalizeLocationDirectoryName(record.region) ? 1 : 0;
}

export function rankLocationDirectoryHits(
  query: LocationResolutionQueryV1,
  hits: readonly LocationDirectorySearchHitV1[],
): LocationDirectorySearchHitV1[] {
  return [...hits].sort((left, right) => {
    const regionDelta = regionMatch(query, right.record) - regionMatch(query, left.record);
    if (regionDelta) return regionDelta;
    const primaryDelta = Number(right.matchedPrimaryName) - Number(left.matchedPrimaryName);
    if (primaryDelta) return primaryDelta;
    const typeDelta = typePreference(query, right.record.type) - typePreference(query, left.record.type);
    if (typeDelta) return typeDelta;
    const populationDelta = right.record.population - left.record.population;
    if (populationDelta) return populationDelta;
    const displayDelta = left.record.displayName.localeCompare(right.record.displayName, 'ru-RU');
    if (displayDelta) return displayDelta;
    return left.record.locationId.localeCompare(right.record.locationId, 'en-US');
  });
}

function toCandidate(record: StoredLocationDirectoryRecordV1): TravelLocationCandidateV1 {
  return {
    locationId: record.locationId,
    displayName: record.displayName,
    type: record.type,
    countryCode: record.countryCode,
    ...(record.region === undefined ? {} : { region: record.region }),
    ...(record.timezone === undefined ? {} : { timezone: record.timezone }),
  };
}

export type RepositoryTravelLocationDirectoryOptions = {
  id: string;
  source: LocationDirectorySourceV1;
  revision: string;
};

/**
 * Read-only resolver over a reviewed repository revision. It performs exact normalized
 * name lookup and deterministic ranking, but never silently auto-selects among multiple hits.
 */
export class RepositoryTravelLocationDirectory implements TravelLocationDirectory {
  readonly id: string;
  readonly revision: string;
  readonly #source: LocationDirectorySourceV1;
  readonly #repository: LocationDirectoryRepository;

  constructor(repository: LocationDirectoryRepository, options: RepositoryTravelLocationDirectoryOptions) {
    if (!validSource(options.source)
      || !validRevisionToken(options.revision)
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(options.id)) {
      throw new Error('Invalid location directory configuration');
    }
    this.#repository = repository;
    this.#source = options.source;
    this.id = options.id;
    this.revision = options.revision;
  }

  async resolve(query: LocationResolutionQueryV1, _context: LocationDirectoryContext): Promise<unknown> {
    const revision = await this.#repository.getRevision(this.#source, this.revision);
    if (!revision) throw new Error('Location directory revision is unavailable');
    if (query.countryCode && revision.countryCode !== query.countryCode) return [];

    const limit = query.limit ?? 10;
    const hits = await this.#repository.searchExact({
      source: this.#source,
      sourceRevision: this.revision,
      normalizedLabel: normalizeLocationDirectoryName(query.rawLabel),
      ...(query.countryCode === undefined ? {} : { countryCode: query.countryCode }),
      ...(query.types === undefined ? {} : { types: query.types }),
      maxMatches: MAX_LOCATION_DIRECTORY_LOOKUP_MATCHES,
    });
    return rankLocationDirectoryHits(query, hits).slice(0, limit).map((hit) => toCandidate(hit.record));
  }
}
