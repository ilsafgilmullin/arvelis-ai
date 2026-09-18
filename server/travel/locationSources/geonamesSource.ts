import type { TravelLocationType } from '../../../src/travel/locationResolution';

export const GEONAMES_SOURCE_VERSION = 1 as const;
export const GEONAMES_LICENSE = 'CC-BY-4.0' as const;
export const GEONAMES_ATTRIBUTION_URL = 'https://www.geonames.org/' as const;
export const GEONAMES_DUMP_HOST = 'download.geonames.org' as const;
export const GEONAMES_DUMP_PATH_PREFIX = '/export/dump/' as const;
export const GEONAMES_DUMP_COLUMNS = 19;
export const MAX_GEONAMES_LINE_BYTES = 32_768;
export const MAX_GEONAMES_SEARCH_NAMES = 128;

const CITY_FEATURE_CODES = new Set([
  'PPL',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLA5',
  'PPLC',
  'PPLG',
  'PPLX',
]);
const STATION_FEATURE_CODES = new Set(['RSTN', 'RSTP', 'BUSTN']);
const AIRPORT_FEATURE_CODES = new Set(['AIRP']);

export type GeoNamesDumpManifestV1 = {
  version: 1;
  source: 'geonames';
  countryCode: string;
  archiveUrl: string;
  archiveSha256: string;
  archiveBytes: number;
  sourceModifiedDate: string;
  retrievedAt: string;
  license: typeof GEONAMES_LICENSE;
  attributionUrl: typeof GEONAMES_ATTRIBUTION_URL;
};

export type GeoNamesLocationSeedV1 = {
  version: 1;
  source: 'geonames';
  /** External source identity only. It is not an ARVELIS locationId. */
  geonameId: number;
  displayName: string;
  searchNames: string[];
  aliasesTruncated: boolean;
  type: TravelLocationType;
  featureClass: 'P' | 'S';
  featureCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
  modificationDate: string;
  admin1Code?: string;
  admin2Code?: string;
  admin3Code?: string;
  admin4Code?: string;
};

export type GeoNamesLineResult =
  | { status: 'accepted'; seed: GeoNamesLocationSeedV1 }
  | { status: 'ignored'; reason: 'unsupported_feature' }
  | {
      status: 'invalid';
      code:
        | 'invalid_line'
        | 'country_mismatch'
        | 'invalid_target_record';
    };

export type GeoNamesManifestValidation =
  | { ok: true; manifest: GeoNamesDumpManifestV1 }
  | { ok: false; code: 'invalid_manifest' };

function isPlainRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.keys(value).every((key) => keys.includes(key));
}

function dateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validTimezone(value: string): boolean {
  if (!value || value.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function cleanText(value: string, max: number, allowEmpty = false): boolean {
  if ((!allowEmpty && value.length === 0) || value.length > max) return false;
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function optionalCode(value: string, max: number): boolean {
  return value.length === 0 || (value.length <= max && /^[A-Za-z0-9._-]+$/.test(value));
}

function parseSafeInteger(value: string, allowEmpty = false): number | null {
  if (allowEmpty && value === '') return 0;
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function travelType(featureClass: string, featureCode: string): TravelLocationType | null {
  if (featureClass === 'P' && CITY_FEATURE_CODES.has(featureCode)) return 'city';
  if (featureClass === 'S' && STATION_FEATURE_CODES.has(featureCode)) return 'station';
  if (featureClass === 'S' && AIRPORT_FEATURE_CODES.has(featureCode)) return 'airport';
  return null;
}

function normalizeGeoNamesSearchName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
}

function uniqueSearchNames(name: string, asciiName: string, alternateNames: string): { names: string[]; truncated: boolean } {
  const ordered = [name, ...(asciiName ? [asciiName] : []), ...alternateNames.split(',')];
  const seen = new Set<string>();
  const names: string[] = [];
  let truncated = false;

  for (const item of ordered) {
    const value = item.trim();
    if (!value || value.length > 400 || /[\u0000-\u001f\u007f]/u.test(value)) continue;
    const key = normalizeGeoNamesSearchName(value);
    if (!key || key.length > 400 || seen.has(key)) continue;
    seen.add(key);
    if (names.length >= MAX_GEONAMES_SEARCH_NAMES) {
      truncated = true;
      continue;
    }
    names.push(value);
  }
  return { names, truncated };
}

export function expectedGeoNamesArchiveUrl(countryCode: string): string | null {
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;
  return `https://${GEONAMES_DUMP_HOST}${GEONAMES_DUMP_PATH_PREFIX}${countryCode}.zip`;
}

export function validateGeoNamesDumpManifestV1(value: unknown, now = new Date()): GeoNamesManifestValidation {
  if (!isPlainRecord(value, [
    'version',
    'source',
    'countryCode',
    'archiveUrl',
    'archiveSha256',
    'archiveBytes',
    'sourceModifiedDate',
    'retrievedAt',
    'license',
    'attributionUrl',
  ])) return { ok: false, code: 'invalid_manifest' };

  const countryCode = value.countryCode;
  if (value.version !== GEONAMES_SOURCE_VERSION
    || value.source !== 'geonames'
    || typeof countryCode !== 'string'
    || !/^[A-Z]{2}$/.test(countryCode)
    || value.archiveUrl !== expectedGeoNamesArchiveUrl(countryCode)
    || typeof value.archiveSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.archiveSha256)
    || typeof value.archiveBytes !== 'number'
    || !Number.isSafeInteger(value.archiveBytes)
    || value.archiveBytes < 1
    || value.archiveBytes > 1_000_000_000
    || !dateOnly(value.sourceModifiedDate)
    || !canonicalIsoInstant(value.retrievedAt)
    || value.license !== GEONAMES_LICENSE
    || value.attributionUrl !== GEONAMES_ATTRIBUTION_URL) {
    return { ok: false, code: 'invalid_manifest' };
  }

  const retrievedAt = Date.parse(value.retrievedAt);
  if (retrievedAt > now.getTime() + 60_000 || value.sourceModifiedDate > value.retrievedAt.slice(0, 10)) {
    return { ok: false, code: 'invalid_manifest' };
  }

  return { ok: true, manifest: structuredClone(value) as GeoNamesDumpManifestV1 };
}

/**
 * Parse one row from the official GeoNames gazetteer dump format.
 * This function never mints an ARVELIS locationId. It produces only a source seed.
 */
export function parseGeoNamesDumpLine(line: string, expectedCountryCode: string): GeoNamesLineResult {
  if (!/^[A-Z]{2}$/.test(expectedCountryCode)
    || typeof line !== 'string'
    || line.length === 0
    || line.includes('\n')
    || line.includes('\r')
    || new TextEncoder().encode(line).length > MAX_GEONAMES_LINE_BYTES) {
    return { status: 'invalid', code: 'invalid_line' };
  }

  const fields = line.split('\t');
  if (fields.length !== GEONAMES_DUMP_COLUMNS) return { status: 'invalid', code: 'invalid_line' };

  const [
    rawId,
    name,
    asciiName,
    alternateNames,
    rawLatitude,
    rawLongitude,
    featureClass,
    featureCode,
    countryCode,
    cc2,
    admin1Code,
    admin2Code,
    admin3Code,
    admin4Code,
    rawPopulation,
    rawElevation,
    rawDem,
    timezone,
    modificationDate,
  ] = fields as [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];

  const geonameId = parseSafeInteger(rawId);
  if (!geonameId || geonameId < 1
    || !cleanText(name, 200)
    || !cleanText(asciiName, 200, true)
    || !cleanText(alternateNames, 10_000, true)
    || !/^[A-Z]$/.test(featureClass)
    || !/^[A-Z0-9]{1,10}$/.test(featureCode)
    || !/^[A-Z]{2}$/.test(countryCode)
    || !cleanText(cc2, 200, true)) {
    return { status: 'invalid', code: 'invalid_line' };
  }

  if (countryCode !== expectedCountryCode) return { status: 'invalid', code: 'country_mismatch' };
  const type = travelType(featureClass, featureCode);
  if (!type) return { status: 'ignored', reason: 'unsupported_feature' };

  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  const population = parseSafeInteger(rawPopulation, true);
  const elevation = rawElevation === '' ? 0 : parseSafeInteger(rawElevation);
  const dem = rawDem === '' ? 0 : parseSafeInteger(rawDem);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || population === null || population < 0
    || elevation === null
    || dem === null
    || !optionalCode(admin1Code, 20)
    || !optionalCode(admin2Code, 80)
    || !optionalCode(admin3Code, 20)
    || !optionalCode(admin4Code, 20)
    || !validTimezone(timezone)
    || !dateOnly(modificationDate)) {
    return { status: 'invalid', code: 'invalid_target_record' };
  }

  const displayName = name.trim();
  const displayNameKey = normalizeGeoNamesSearchName(displayName);
  if (!displayName || displayNameKey.length > 400) return { status: 'invalid', code: 'invalid_target_record' };
  const searchNames = uniqueSearchNames(displayName, asciiName, alternateNames);
  if (searchNames.names.length === 0 || !searchNames.names.some((candidate) => (
    normalizeGeoNamesSearchName(candidate) === displayNameKey
  ))) return { status: 'invalid', code: 'invalid_target_record' };

  const seed: GeoNamesLocationSeedV1 = {
    version: GEONAMES_SOURCE_VERSION,
    source: 'geonames',
    geonameId,
    displayName,
    searchNames: searchNames.names,
    aliasesTruncated: searchNames.truncated,
    type,
    featureClass: featureClass as 'P' | 'S',
    featureCode,
    countryCode,
    latitude,
    longitude,
    timezone,
    population,
    modificationDate,
    ...(admin1Code ? { admin1Code } : {}),
    ...(admin2Code ? { admin2Code } : {}),
    ...(admin3Code ? { admin3Code } : {}),
    ...(admin4Code ? { admin4Code } : {}),
  };
  return { status: 'accepted', seed };
}
