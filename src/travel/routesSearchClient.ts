import type { TravelLocationCandidateV1, TravelLocationType } from './locationResolution';
import { validateTransportSearchResponse, type TransportSearchResponse } from './transportContracts';

const ROUTES_SEARCH_RESPONSE_LIMIT_BYTES = 1024 * 1024;
const ROUTES_SEARCH_REQUEST_ID_HEADER = 'X-Arvelis-Request-Id';
const ROUTES_SEARCH_PROVIDER_ID = 'yandex-rasp-v3';
const LOCATION_ID_PATTERN = /^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const LOCATION_TYPES = new Set<TravelLocationType>(['city', 'station', 'airport']);

export type RoutesSearchSelection = {
  originLocationId?: string;
  destinationLocationId?: string;
};

export type RoutesSearchClientOutcome =
  | { status: 'ready'; response: TransportSearchResponse }
  | { status: 'needs_disambiguation'; field: 'origin' | 'destination'; candidates: TravelLocationCandidateV1[] }
  | { status: 'offline' }
  | { status: 'cancelled' }
  | { status: 'failed'; code: string; httpStatus?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validOptionalText(value: unknown, max: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value);
}

function parseCandidate(value: unknown): TravelLocationCandidateV1 | null {
  if (!isRecord(value)) return null;
  const allowed = new Set(['locationId', 'displayName', 'type', 'countryCode', 'region', 'timezone']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (typeof value.locationId !== 'string' || !LOCATION_ID_PATTERN.test(value.locationId)) return null;
  if (typeof value.displayName !== 'string' || value.displayName.length < 1 || value.displayName.length > 160 || value.displayName.trim() !== value.displayName) return null;
  if (typeof value.type !== 'string' || !LOCATION_TYPES.has(value.type as TravelLocationType)) return null;
  if (value.countryCode !== undefined && (typeof value.countryCode !== 'string' || !/^[A-Z]{2}$/.test(value.countryCode))) return null;
  if (!validOptionalText(value.region, 80) || !validOptionalText(value.timezone, 64)) return null;
  return {
    locationId: value.locationId,
    displayName: value.displayName,
    type: value.type as TravelLocationType,
    ...(typeof value.countryCode === 'string' ? { countryCode: value.countryCode } : {}),
    ...(typeof value.region === 'string' ? { region: value.region } : {}),
    ...(typeof value.timezone === 'string' ? { timezone: value.timezone } : {}),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0 || declared > ROUTES_SEARCH_RESPONSE_LIMIT_BYTES) {
      throw new Error('routes_response_too_large');
    }
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).length > ROUTES_SEARCH_RESPONSE_LIMIT_BYTES) throw new Error('routes_response_too_large');
  return JSON.parse(text) as unknown;
}

function validSelection(selection: RoutesSearchSelection): boolean {
  const values = [selection.originLocationId, selection.destinationLocationId];
  return values.every((value) => value === undefined || LOCATION_ID_PATTERN.test(value));
}

export async function searchRoutesForTrip(input: {
  tripId: string;
  selection?: RoutesSearchSelection;
  signal?: AbortSignal;
}): Promise<RoutesSearchClientOutcome> {
  if (!input.tripId || input.tripId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(input.tripId)) {
    return { status: 'failed', code: 'invalid_trip_id' };
  }
  if (input.selection !== undefined && !validSelection(input.selection)) {
    return { status: 'failed', code: 'invalid_location_selection' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };

  let response: Response;
  try {
    response = await fetch(`/api/trips/${encodeURIComponent(input.tripId)}/routes/search`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.selection === undefined ? {} : { selection: input.selection }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } catch (error) {
    if (input.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return { status: 'cancelled' };
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? { status: 'offline' }
      : { status: 'failed', code: 'network_error' };
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(response);
  } catch {
    return { status: 'failed', code: 'invalid_response', httpStatus: response.status };
  }

  if (response.status === 409 && isRecord(payload) && payload.status === 'needs_disambiguation') {
    if ((payload.field !== 'origin' && payload.field !== 'destination') || !Array.isArray(payload.candidates) || payload.candidates.length < 2 || payload.candidates.length > 10) {
      return { status: 'failed', code: 'invalid_disambiguation_response', httpStatus: response.status };
    }
    const candidates = payload.candidates.map(parseCandidate);
    if (candidates.some((candidate) => candidate === null)) {
      return { status: 'failed', code: 'invalid_disambiguation_response', httpStatus: response.status };
    }
    return { status: 'needs_disambiguation', field: payload.field, candidates: candidates as TravelLocationCandidateV1[] };
  }

  if (!response.ok) {
    const code = isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
      ? payload.error.code
      : `http_${response.status}`;
    return { status: 'failed', code, httpStatus: response.status };
  }

  const requestId = response.headers.get(ROUTES_SEARCH_REQUEST_ID_HEADER);
  if (!requestId || !isRecord(payload) || payload.status !== 'success' || !Object.hasOwn(payload, 'response')) {
    return { status: 'failed', code: 'invalid_response', httpStatus: response.status };
  }
  const validation = validateTransportSearchResponse(payload.response, ROUTES_SEARCH_PROVIDER_ID, requestId);
  if (validation.length > 0) {
    return { status: 'failed', code: 'transport_contract_violation', httpStatus: response.status };
  }
  return { status: 'ready', response: payload.response as TransportSearchResponse };
}
