import type { YandexLocationBindings } from './yandexRaspSearchMapping';

export type YandexRaspBindingEnvironment = 'development' | 'production';
export type YandexRaspTrustedBindingEntry = {
  locationId: string;
  locationType: 'city' | 'station' | 'airport';
  searchCode: string;
  stationCodes: readonly string[];
  verifiedAt: string;
};
export type YandexRaspTrustedBindingsManifest = {
  version: 1;
  environment: YandexRaspBindingEnvironment;
  entries: readonly YandexRaspTrustedBindingEntry[];
};

const LOCATION_ID = /^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const CITY_CODE = /^c[1-9]\d{0,11}$/;
const STATION_CODE = /^s[1-9]\d{0,11}$/;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_BINDINGS = 2_048;
const MAX_STATIONS_PER_BINDING = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === allowed.length && keys.every((key) => typeof key === 'string' && allowed.includes(key));
}

function fail(): never {
  throw new Error('Invalid trusted Yandex Rasp binding manifest.');
}

function canonicalVerifiedAt(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function parseEntry(value: unknown): YandexRaspTrustedBindingEntry {
  if (!isRecord(value) || !exactKeys(value, ['locationId', 'locationType', 'searchCode', 'stationCodes', 'verifiedAt'])) return fail();
  if (typeof value.locationId !== 'string' || !LOCATION_ID.test(value.locationId)) return fail();
  if (value.locationType !== 'city' && value.locationType !== 'station' && value.locationType !== 'airport') return fail();
  if (typeof value.searchCode !== 'string') return fail();
  if (!Array.isArray(value.stationCodes) || value.stationCodes.length < 1 || value.stationCodes.length > MAX_STATIONS_PER_BINDING) return fail();
  if (value.stationCodes.some((code) => typeof code !== 'string' || !STATION_CODE.test(code)) || new Set(value.stationCodes).size !== value.stationCodes.length) return fail();
  if (!canonicalVerifiedAt(value.verifiedAt)) return fail();

  if (value.locationType === 'city') {
    if (!CITY_CODE.test(value.searchCode)) return fail();
  } else if (!STATION_CODE.test(value.searchCode) || value.stationCodes.length !== 1 || value.stationCodes[0] !== value.searchCode) {
    return fail();
  }

  return {
    locationId: value.locationId,
    locationType: value.locationType,
    searchCode: value.searchCode,
    stationCodes: Object.freeze([...value.stationCodes]),
    verifiedAt: value.verifiedAt,
  };
}

/**
 * Converts a server-controlled, reviewed manifest into adapter-owned bindings.
 * The manifest is configuration, never user/model input. Environment mismatch is
 * rejected so a development directory cannot be reused for production by accident.
 */
export function parseYandexRaspTrustedBindingsManifest(
  value: unknown,
  expectedEnvironment: YandexRaspBindingEnvironment,
): YandexLocationBindings {
  if (!isRecord(value) || !exactKeys(value, ['version', 'environment', 'entries'])) return fail();
  if (value.version !== 1 || value.environment !== expectedEnvironment || !Array.isArray(value.entries) || value.entries.length > MAX_BINDINGS) return fail();

  const bindings = new Map<string, { searchCode: string; stationCodes: readonly string[] }>();
  const seenSearchCodes = new Set<string>();
  for (const rawEntry of value.entries) {
    const entry = parseEntry(rawEntry);
    if (bindings.has(entry.locationId) || seenSearchCodes.has(entry.searchCode)) return fail();
    bindings.set(entry.locationId, { searchCode: entry.searchCode, stationCodes: entry.stationCodes });
    seenSearchCodes.add(entry.searchCode);
  }
  return bindings;
}
