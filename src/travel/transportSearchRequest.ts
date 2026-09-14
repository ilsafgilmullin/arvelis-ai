import { TRANSPORT_MODES, type NormalizedTransportMode as TransportMode } from './transportContracts';

export const MAX_TRANSPORT_SEARCH_BYTES = 8_000;
export const MAX_TRANSPORT_PASSENGERS = 9;
export type TransportSearchLocationV1 = {
  rawLabel: string;
  type: 'city' | 'station' | 'airport' | 'unknown';
  countryCode?: string;
  region?: string;
} & ({ resolution: 'unresolved' } | {
  resolution: 'resolved';
  displayName: string;
  /** ARVELIS location-directory identity, never a provider code. */
  locationId: string;
});

export type TransportSearchRequestV1 = {
  version: 1;
  origin: TransportSearchLocationV1;
  destination: TransportSearchLocationV1;
  departureDate: string;
  returnDate?: string;
  /** V1 has no age/fare categories: the existing product supplies adult counts. */
  passengers: { adults: number };
  allowedModes?: TransportMode[];
  preferredMode?: TransportMode;
  locale: 'ru-RU';
  timezone: string;
  preferredCurrency?: string;
  constraints?: { maxTransfers?: number };
};

export type TransportSearchIssue = {
  path: string;
  code: 'invalid_search_request' | 'missing_required_parameter' | 'unsupported_transport_mode' | 'unresolved_location';
};
export type TransportSearchValidation =
  | { ok: true; request: TransportSearchRequestV1 }
  | { ok: false; issues: TransportSearchIssue[] };

/** Reject accessors, exotic prototypes, cycles and poison keys before serialization. */
export function isSafeTransportJson(value: unknown, maxBytes = MAX_TRANSPORT_SEARCH_BYTES): boolean {
  let nodes = 0;
  const seen = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 16) return false;
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
  } catch { return false; }
}

export function isTransportCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value)
    && Intl.supportedValuesOf('currency').includes(value) && !['XXX', 'XTS'].includes(value);
}

export function transportLocalDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key)!.value).join('-');
}

function dateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateTransportSearchRequestV1(value: unknown, now = new Date()): TransportSearchValidation {
  const issues: TransportSearchIssue[] = [];
  const issue = (path: string, code: TransportSearchIssue['code'] = 'invalid_search_request') => { issues.push({ path, code }); };
  if (value === undefined || value === null) return { ok: false, issues: ['origin', 'destination', 'departureDate', 'passengers', 'locale', 'timezone'].map((path) => ({ path, code: 'missing_required_parameter' })) };
  if (!isSafeTransportJson(value)) return { ok: false, issues: [{ path: '$', code: 'invalid_search_request' }] };
  function record(item: unknown, path: string, keys: readonly string[]): item is Record<string, unknown> {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { issue(path); return false; }
    for (const key of Object.keys(item)) if (!keys.includes(key)) issue(`${path}.${key}`);
    return true;
  }
  const text = (item: unknown, max: number): item is string => typeof item === 'string' && item.length > 0 && item.length <= max && item.trim() === item && !/[\u0000-\u001f\u007f]/u.test(item);
  if (!record(value, '$', ['version', 'origin', 'destination', 'departureDate', 'returnDate', 'passengers', 'allowedModes', 'preferredMode', 'locale', 'timezone', 'preferredCurrency', 'constraints'])) return { ok: false, issues };
  for (const key of ['origin', 'destination', 'departureDate', 'passengers', 'locale', 'timezone']) if (value[key] === undefined) issue(key, 'missing_required_parameter');
  if (value.version !== 1) issue('version');
  for (const key of ['origin', 'destination']) {
    const location = value[key];
    if (location === undefined) continue;
    if (!record(location, key, ['rawLabel', 'type', 'resolution', 'displayName', 'locationId', 'countryCode', 'region'])) continue;
    if (!text(location.rawLabel, 160)) issue(`${key}.rawLabel`);
    if (typeof location.type !== 'string' || !['city', 'station', 'airport', 'unknown'].includes(location.type)) issue(`${key}.type`);
    if (location.resolution === 'resolved') {
      if (location.type === 'unknown') issue(`${key}.type`);
      if (!text(location.displayName, 160)) issue(`${key}.displayName`);
      if (typeof location.locationId !== 'string' || !/^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(location.locationId)) issue(`${key}.locationId`);
    } else if (location.resolution === 'unresolved') {
      if ('locationId' in location || 'displayName' in location) issue(key);
    } else issue(`${key}.resolution`);
    if (location.countryCode !== undefined && (typeof location.countryCode !== 'string' || !/^[A-Z]{2}$/.test(location.countryCode))) issue(`${key}.countryCode`);
    if (location.region !== undefined && !text(location.region, 80)) issue(`${key}.region`);
  }
  let today: string | undefined;
  try {
    if (!text(value.timezone, 64) || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value.timezone)) throw new Error();
    today = transportLocalDate(now, value.timezone);
  } catch { issue('timezone'); }
  if (!dateOnly(value.departureDate) || (today !== undefined && value.departureDate < today)) issue('departureDate');
  if (value.returnDate !== undefined && (!dateOnly(value.returnDate) || (dateOnly(value.departureDate) && value.returnDate < value.departureDate))) issue('returnDate');
  if (record(value.passengers, 'passengers', ['adults'])) {
    const count = value.passengers.adults;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_TRANSPORT_PASSENGERS) issue('passengers.adults');
  }
  const mode = (item: unknown) => typeof item === 'string' && (TRANSPORT_MODES as readonly string[]).includes(item);
  if (value.allowedModes !== undefined && (!Array.isArray(value.allowedModes) || value.allowedModes.length < 1 || value.allowedModes.length > TRANSPORT_MODES.length || value.allowedModes.some((item) => !mode(item)) || new Set(value.allowedModes).size !== value.allowedModes.length)) issue('allowedModes', 'unsupported_transport_mode');
  if (value.preferredMode !== undefined && (!mode(value.preferredMode) || (Array.isArray(value.allowedModes) && !value.allowedModes.includes(value.preferredMode)))) issue('preferredMode', 'unsupported_transport_mode');
  if (value.locale !== 'ru-RU') issue('locale');
  if (value.preferredCurrency !== undefined && !isTransportCurrency(value.preferredCurrency)) issue('preferredCurrency');
  if (value.constraints !== undefined && record(value.constraints, 'constraints', ['maxTransfers'])) {
    const max = value.constraints.maxTransfers;
    if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max) || max < 0 || max > 4)) issue('constraints.maxTransfers');
  }
  if (issues.length > 0) return { ok: false, issues };
  const request = structuredClone(value) as TransportSearchRequestV1;
  const { origin, destination } = request;
  const sameResolved = origin.resolution === 'resolved' && destination.resolution === 'resolved' && origin.locationId === destination.locationId;
  const sameLabel = origin.rawLabel.normalize('NFKC').toLocaleLowerCase('ru-RU') === destination.rawLabel.normalize('NFKC').toLocaleLowerCase('ru-RU') && origin.countryCode === destination.countryCode && origin.region === destination.region;
  if (sameResolved || sameLabel) return { ok: false, issues: [{ path: 'destination', code: 'invalid_search_request' }] };
  return { ok: true, request };
}

export function transportSearchCompleteness(request: TransportSearchRequestV1): TransportSearchIssue[] {
  return (['origin', 'destination'] as const).filter((key) => request[key].resolution === 'unresolved').map((path) => ({ path, code: 'unresolved_location' }));
}
