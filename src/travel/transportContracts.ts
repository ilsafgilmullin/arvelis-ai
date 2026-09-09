import type { Trip } from './domain';

export const TRANSPORT_CONTRACT_VERSION = 1 as const;

export const TRANSPORT_MODES = [
  'flight',
  'train',
  'bus',
  'suburbanRail',
  'transfer',
  'ferry',
  'car',
  'other',
] as const;
export type NormalizedTransportMode = (typeof TRANSPORT_MODES)[number];

export type TransportSearchLeg = {
  id: string;
  fromLabel: string;
  toLabel: string;
  date: string;
};

export type TransportSearchRequest = {
  version: 1;
  tripId: string;
  tripRevision: string;
  travelerCount: number;
  budgetLimitRub: number;
  transportPreferenceHints: string[];
  legs: TransportSearchLeg[];
};

export type TransportLocation = {
  label: string;
  code?: string;
};

export type TransportMoney = {
  amountMinor: number;
  currency: string;
};

export type TransportAvailability = 'available' | 'limited' | 'unavailable' | 'unknown';

export type NormalizedTransportSegment = {
  id: string;
  mode: NormalizedTransportMode;
  from: TransportLocation;
  to: TransportLocation;
  departureAt: string;
  arrivalAt: string;
  carrierName?: string;
  serviceNumber?: string;
};

export type NormalizedTransportRoute = {
  id: string;
  providerRouteId: string;
  segments: NormalizedTransportSegment[];
  price?: TransportMoney;
  availability: TransportAvailability;
  validUntil?: string;
  sourceUrl?: string;
};

export type TransportSearchResponse = {
  version: 1;
  providerId: string;
  requestId: string;
  retrievedAt: string;
  routes: NormalizedTransportRoute[];
};

export type TransportContractErrorCode =
  | 'destination_required'
  | 'exact_dates_required'
  | 'invalid_trip';

export class TransportContractError extends Error {
  readonly code: TransportContractErrorCode;

  constructor(code: TransportContractErrorCode, message: string) {
    super(message);
    this.name = 'TransportContractError';
    this.code = code;
  }
}

export type TransportValidationError = {
  path: string;
  code:
    | 'invalid_shape'
    | 'invalid_value'
    | 'duplicate_id'
    | 'provider_mismatch'
    | 'request_mismatch'
    | 'chronology_error';
};

export type TransportRouteMetrics = {
  durationMinutes: number;
  transferCount: number;
};

export type TransportRoutePolicy = {
  freshness: 'current' | 'expired' | 'unspecified';
  scheduleAuthoritative: boolean;
  priceAuthoritative: boolean;
  availabilityAuthoritative: boolean;
};

export type TransportComparisonCriterion = 'duration' | 'transfers' | 'price';
export type TransportComparisonReason = 'stale_or_unbounded' | 'missing_price' | 'mixed_currency';

export type TransportComparisonResult =
  | {
      comparable: true;
      criterion: TransportComparisonCriterion;
      routeIds: string[];
    }
  | {
      comparable: false;
      criterion: TransportComparisonCriterion;
      routeIds: string[];
      reason: TransportComparisonReason;
    };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value);
}

function uniqueIds<T extends { id: string }>(items: T[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function createTransportSearchRequest(trip: Trip): TransportSearchRequest {
  if (!validId(trip.id) || !validText(trip.origin, 160) || trip.travelers.length < 1) {
    throw new TransportContractError('invalid_trip', 'Trip does not satisfy the transport contract.');
  }
  if (!trip.destination || trip.preferences.destinationUnknown) {
    throw new TransportContractError('destination_required', 'Transport search requires an explicit destination.');
  }
  if (trip.preferences.flexibleDates || !trip.startDate || !trip.endDate) {
    throw new TransportContractError('exact_dates_required', 'Transport search V1 requires exact outbound and return dates.');
  }
  if (!validDateOnly(trip.startDate) || !validDateOnly(trip.endDate)) {
    throw new TransportContractError('exact_dates_required', 'Transport search dates are invalid.');
  }

  return {
    version: TRANSPORT_CONTRACT_VERSION,
    tripId: trip.id,
    tripRevision: trip.updatedAt,
    travelerCount: trip.travelers.length,
    budgetLimitRub: trip.budget.limitRub,
    transportPreferenceHints: [...trip.preferences.transportPreferences],
    legs: [
      { id: 'outbound', fromLabel: trip.origin, toLabel: trip.destination, date: trip.startDate },
      { id: 'return', fromLabel: trip.destination, toLabel: trip.origin, date: trip.endDate },
    ],
  };
}

export function validateTransportSearchResponse(
  candidate: unknown,
  expectedProviderId: string,
  expectedRequestId: string,
): TransportValidationError[] {
  const errors: TransportValidationError[] = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [{ path: '$', code: 'invalid_shape' }];
  }

  const response = candidate as Partial<TransportSearchResponse>;
  if (response.version !== TRANSPORT_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(response.providerId)) errors.push({ path: 'providerId', code: 'invalid_value' });
  else if (response.providerId !== expectedProviderId) errors.push({ path: 'providerId', code: 'provider_mismatch' });
  if (!validId(response.requestId)) errors.push({ path: 'requestId', code: 'invalid_value' });
  else if (response.requestId !== expectedRequestId) errors.push({ path: 'requestId', code: 'request_mismatch' });
  if (!validIsoDateTime(response.retrievedAt)) errors.push({ path: 'retrievedAt', code: 'invalid_value' });
  if (!Array.isArray(response.routes) || response.routes.length > 128) errors.push({ path: 'routes', code: 'invalid_shape' });
  if (errors.length > 0) return errors;

  const routes = response.routes as NormalizedTransportRoute[];
  if (!uniqueIds(routes)) errors.push({ path: 'routes', code: 'duplicate_id' });
  const retrievedAtMs = Date.parse(response.retrievedAt as string);

  routes.forEach((route, routeIndex) => {
    if (!validId(route.id)) errors.push({ path: `routes[${routeIndex}].id`, code: 'invalid_value' });
    if (!validText(route.providerRouteId, 256)) errors.push({ path: `routes[${routeIndex}].providerRouteId`, code: 'invalid_value' });
    if (!Array.isArray(route.segments) || route.segments.length < 1 || route.segments.length > 16) {
      errors.push({ path: `routes[${routeIndex}].segments`, code: 'invalid_shape' });
      return;
    }
    if (!uniqueIds(route.segments)) errors.push({ path: `routes[${routeIndex}].segments`, code: 'duplicate_id' });
    if (!['available', 'limited', 'unavailable', 'unknown'].includes(route.availability)) {
      errors.push({ path: `routes[${routeIndex}].availability`, code: 'invalid_value' });
    }
    if (route.validUntil !== undefined) {
      if (!validIsoDateTime(route.validUntil) || Date.parse(route.validUntil) < retrievedAtMs) {
        errors.push({ path: `routes[${routeIndex}].validUntil`, code: 'invalid_value' });
      }
    }
    if (route.sourceUrl !== undefined && !validHttpsUrl(route.sourceUrl)) {
      errors.push({ path: `routes[${routeIndex}].sourceUrl`, code: 'invalid_value' });
    }
    if (route.price !== undefined) {
      if (!Number.isSafeInteger(route.price.amountMinor) || route.price.amountMinor < 0) {
        errors.push({ path: `routes[${routeIndex}].price.amountMinor`, code: 'invalid_value' });
      }
      if (!CURRENCY_PATTERN.test(route.price.currency)) {
        errors.push({ path: `routes[${routeIndex}].price.currency`, code: 'invalid_value' });
      }
    }

    let previousArrival = Number.NEGATIVE_INFINITY;
    route.segments.forEach((segment, segmentIndex) => {
      const prefix = `routes[${routeIndex}].segments[${segmentIndex}]`;
      if (!validId(segment.id)) errors.push({ path: `${prefix}.id`, code: 'invalid_value' });
      if (!(TRANSPORT_MODES as readonly string[]).includes(segment.mode)) errors.push({ path: `${prefix}.mode`, code: 'invalid_value' });
      if (!validText(segment.from?.label, 160)) errors.push({ path: `${prefix}.from.label`, code: 'invalid_value' });
      if (segment.from?.code !== undefined && !validText(segment.from.code, 32)) errors.push({ path: `${prefix}.from.code`, code: 'invalid_value' });
      if (!validText(segment.to?.label, 160)) errors.push({ path: `${prefix}.to.label`, code: 'invalid_value' });
      if (segment.to?.code !== undefined && !validText(segment.to.code, 32)) errors.push({ path: `${prefix}.to.code`, code: 'invalid_value' });
      if (!validIsoDateTime(segment.departureAt) || !validIsoDateTime(segment.arrivalAt)) {
        errors.push({ path: prefix, code: 'invalid_value' });
        return;
      }
      const departure = Date.parse(segment.departureAt);
      const arrival = Date.parse(segment.arrivalAt);
      if (arrival <= departure || departure < previousArrival) errors.push({ path: prefix, code: 'chronology_error' });
      previousArrival = arrival;
      if (segment.carrierName !== undefined && !validText(segment.carrierName, 160)) errors.push({ path: `${prefix}.carrierName`, code: 'invalid_value' });
      if (segment.serviceNumber !== undefined && !validText(segment.serviceNumber, 80)) errors.push({ path: `${prefix}.serviceNumber`, code: 'invalid_value' });
    });
  });

  return errors;
}

export function getTransportRouteMetrics(route: NormalizedTransportRoute): TransportRouteMetrics {
  const first = route.segments[0];
  const last = route.segments[route.segments.length - 1];
  if (first === undefined || last === undefined) return { durationMinutes: 0, transferCount: 0 };
  const durationMinutes = Math.max(0, Math.round((Date.parse(last.arrivalAt) - Date.parse(first.departureAt)) / 60_000));
  return { durationMinutes, transferCount: Math.max(0, route.segments.length - 1) };
}

export function evaluateTransportRoutePolicy(
  route: NormalizedTransportRoute,
  response: TransportSearchResponse,
  now = new Date(),
): TransportRoutePolicy {
  let freshness: TransportRoutePolicy['freshness'] = 'unspecified';
  if (route.validUntil !== undefined) {
    freshness = Date.parse(route.validUntil) >= now.getTime() ? 'current' : 'expired';
  }
  const current = freshness === 'current';
  return {
    freshness,
    scheduleAuthoritative: current,
    priceAuthoritative: current && route.price !== undefined,
    availabilityAuthoritative: current && route.availability !== 'unknown',
  };
}

export function compareTransportRoutes(
  response: TransportSearchResponse,
  criterion: TransportComparisonCriterion,
  now = new Date(),
): TransportComparisonResult {
  const routes = [...response.routes];
  if (routes.some((route) => !evaluateTransportRoutePolicy(route, response, now).scheduleAuthoritative)) {
    return { comparable: false, criterion, routeIds: routes.map((route) => route.id), reason: 'stale_or_unbounded' };
  }

  if (criterion === 'price') {
    if (routes.some((route) => route.price === undefined || !evaluateTransportRoutePolicy(route, response, now).priceAuthoritative)) {
      return { comparable: false, criterion, routeIds: routes.map((route) => route.id), reason: 'missing_price' };
    }
    const currencies = new Set(routes.map((route) => route.price?.currency));
    if (currencies.size !== 1) {
      return { comparable: false, criterion, routeIds: routes.map((route) => route.id), reason: 'mixed_currency' };
    }
    routes.sort((left, right) => (left.price?.amountMinor ?? 0) - (right.price?.amountMinor ?? 0));
  } else if (criterion === 'duration') {
    routes.sort((left, right) => getTransportRouteMetrics(left).durationMinutes - getTransportRouteMetrics(right).durationMinutes);
  } else {
    routes.sort((left, right) => getTransportRouteMetrics(left).transferCount - getTransportRouteMetrics(right).transferCount);
  }

  return { comparable: true, criterion, routeIds: routes.map((route) => route.id) };
}
