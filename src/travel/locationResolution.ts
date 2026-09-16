import type { TransportSearchLocationV1 } from './transportSearchRequest';

export const LOCATION_RESOLUTION_VERSION = 1 as const;
export const MAX_LOCATION_QUERY_BYTES = 2_048;
export const MAX_LOCATION_CANDIDATES = 10;
export const TRAVEL_LOCATION_TYPES = ['city', 'station', 'airport'] as const;
export type TravelLocationType = (typeof TRAVEL_LOCATION_TYPES)[number];

export type LocationResolutionQueryV1 = {
  version: 1;
  rawLabel: string;
  locale: 'ru-RU';
  countryCode?: string;
  region?: string;
  types?: TravelLocationType[];
  limit?: number;
};

/** Provider-neutral ARVELIS identity. Provider codes are intentionally absent. */
export type TravelLocationCandidateV1 = {
  locationId: string;
  displayName: string;
  type: TravelLocationType;
  countryCode?: string;
  region?: string;
  timezone?: string;
};

export type LocationResolutionResponseV1 = {
  version: 1;
  status: 'resolved' | 'ambiguous' | 'unresolved';
  rawLabel: string;
  directoryId: string;
  directoryRevision: string;
  candidates: TravelLocationCandidateV1[];
};

export type LocationResolutionIssue = {
  path: string;
  code: 'invalid_location_query' | 'missing_required_parameter' | 'unsupported_location_type';
};

export type LocationResolutionValidation =
  | { ok: true; query: LocationResolutionQueryV1 }
  | { ok: false; issues: LocationResolutionIssue[] };

const LOCATION_ID_PATTERN = /^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const DIRECTORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const TIMEZONE_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/;

function safeJson(value: unknown, maxBytes = MAX_LOCATION_QUERY_BYTES): boolean {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 2_000 || depth > 12) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'string') return item.length <= maxBytes;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item !== 'object' || seen.has(item)) return false;
    const proto = Object.getPrototypeOf(item);
    if (Array.isArray(item) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return false;
    seen.add(item);
    for (const key of Reflect.ownKeys(item)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!('value' in descriptor) || !visit(descriptor.value, depth + 1)) return false;
    }
    seen.delete(item);
    return true;
  }
  try {
    return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= maxBytes;
  } catch {
    return false;
  }
}

function plainRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.keys(value).every((key) => keys.includes(key));
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64 || !TIMEZONE_PATTERN.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validateLocationResolutionQueryV1(value: unknown): LocationResolutionValidation {
  const issues: LocationResolutionIssue[] = [];
  const issue = (path: string, code: LocationResolutionIssue['code'] = 'invalid_location_query') => issues.push({ path, code });
  if (value === undefined || value === null) {
    return { ok: false, issues: ['rawLabel', 'locale'].map((path) => ({ path, code: 'missing_required_parameter' as const })) };
  }
  if (!safeJson(value)) return { ok: false, issues: [{ path: '$', code: 'invalid_location_query' }] };
  if (!plainRecord(value, ['version', 'rawLabel', 'locale', 'countryCode', 'region', 'types', 'limit'])) {
    return { ok: false, issues: [{ path: '$', code: 'invalid_location_query' }] };
  }
  for (const key of ['rawLabel', 'locale']) if (value[key] === undefined) issue(key, 'missing_required_parameter');
  if (value.version !== LOCATION_RESOLUTION_VERSION) issue('version');
  if (!validText(value.rawLabel, 160)) issue('rawLabel');
  if (value.locale !== 'ru-RU') issue('locale');
  if (value.countryCode !== undefined && (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.countryCode))) issue('countryCode');
  if (value.region !== undefined && !validText(value.region, 80)) issue('region');
  if (value.types !== undefined) {
    if (!Array.isArray(value.types)
      || value.types.length < 1
      || value.types.length > TRAVEL_LOCATION_TYPES.length
      || value.types.some((item) => typeof item !== 'string' || !(TRAVEL_LOCATION_TYPES as readonly string[]).includes(item))
      || new Set(value.types).size !== value.types.length) {
      issue('types', 'unsupported_location_type');
    }
  }
  if (value.limit !== undefined && (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > MAX_LOCATION_CANDIDATES)) issue('limit');
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, query: structuredClone(value) as LocationResolutionQueryV1 };
}

export function validTravelLocationCandidateV1(value: unknown): value is TravelLocationCandidateV1 {
  if (!plainRecord(value, ['locationId', 'displayName', 'type', 'countryCode', 'region', 'timezone'])) return false;
  if (typeof value.locationId !== 'string' || !LOCATION_ID_PATTERN.test(value.locationId)) return false;
  if (!validText(value.displayName, 160)) return false;
  if (typeof value.type !== 'string' || !(TRAVEL_LOCATION_TYPES as readonly string[]).includes(value.type)) return false;
  if (value.countryCode !== undefined && (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.countryCode))) return false;
  if (value.region !== undefined && !validText(value.region, 80)) return false;
  if (value.timezone !== undefined && !validTimezone(value.timezone)) return false;
  return true;
}

export function validLocationResolutionResponseV1(value: unknown): value is LocationResolutionResponseV1 {
  if (!plainRecord(value, ['version', 'status', 'rawLabel', 'directoryId', 'directoryRevision', 'candidates'])) return false;
  if (value.version !== LOCATION_RESOLUTION_VERSION) return false;
  if (value.status !== 'resolved' && value.status !== 'ambiguous' && value.status !== 'unresolved') return false;
  if (!validText(value.rawLabel, 160)) return false;
  if (typeof value.directoryId !== 'string' || !DIRECTORY_ID_PATTERN.test(value.directoryId)) return false;
  if (typeof value.directoryRevision !== 'string' || !REVISION_PATTERN.test(value.directoryRevision)) return false;
  if (!Array.isArray(value.candidates) || value.candidates.length > MAX_LOCATION_CANDIDATES || !value.candidates.every(validTravelLocationCandidateV1)) return false;
  if (new Set(value.candidates.map((candidate) => candidate.locationId)).size !== value.candidates.length) return false;
  if (value.status === 'unresolved' && value.candidates.length !== 0) return false;
  if (value.status === 'resolved' && value.candidates.length !== 1) return false;
  if (value.status === 'ambiguous' && value.candidates.length < 2) return false;
  return true;
}

export function candidateToTransportSearchLocation(
  rawLabel: string,
  candidate: TravelLocationCandidateV1,
): TransportSearchLocationV1 {
  if (!validText(rawLabel, 160) || !validTravelLocationCandidateV1(candidate)) {
    throw new Error('Invalid resolved travel location');
  }
  return {
    rawLabel,
    type: candidate.type,
    resolution: 'resolved',
    displayName: candidate.displayName,
    locationId: candidate.locationId,
    ...(candidate.countryCode === undefined ? {} : { countryCode: candidate.countryCode }),
    ...(candidate.region === undefined ? {} : { region: candidate.region }),
  };
}
