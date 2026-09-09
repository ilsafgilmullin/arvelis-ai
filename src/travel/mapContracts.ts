import type { Trip } from './domain';

export const MAP_CONTRACT_VERSION = 1 as const;

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapRequestPointRole = 'origin' | 'destination' | 'waypoint';

export type MapRouteRequestPoint = {
  id: string;
  role: MapRequestPointRole;
  label: string;
  coordinate?: MapCoordinate;
};

export type MapRouteRequest = {
  version: 1;
  tripId: string;
  tripRevision: string;
  points: MapRouteRequestPoint[];
};

export type MapResolvedPoint = {
  id: string;
  requestPointId: string;
  label: string;
  coordinate: MapCoordinate;
  resolution: 'provided' | 'provider_resolved';
};

export type MapRouteGeometry = {
  id: string;
  pointIds: string[];
  geometry: MapCoordinate[];
  distanceMeters?: number;
  durationSeconds?: number;
  sourceUrl?: string;
};

export type MapAttribution = {
  text: string;
  url?: string;
};

export type MapRouteResponse = {
  version: 1;
  providerId: string;
  requestId: string;
  retrievedAt: string;
  validUntil?: string;
  points: MapResolvedPoint[];
  routes: MapRouteGeometry[];
  attributions: MapAttribution[];
};

export type MapValidationError = {
  path: string;
  code:
    | 'invalid_shape'
    | 'invalid_value'
    | 'duplicate_id'
    | 'provider_mismatch'
    | 'request_mismatch'
    | 'request_point_mismatch'
    | 'coordinate_mismatch';
};

export type MapResponsePolicy = {
  freshness: 'current' | 'expired' | 'unspecified';
  routeAuthoritative: boolean;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validCoordinate(value: unknown): value is MapCoordinate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<MapCoordinate>;
  return typeof candidate.latitude === 'number'
    && Number.isFinite(candidate.latitude)
    && candidate.latitude >= -90
    && candidate.latitude <= 90
    && typeof candidate.longitude === 'number'
    && Number.isFinite(candidate.longitude)
    && candidate.longitude >= -180
    && candidate.longitude <= 180;
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createMapRouteRequest(trip: Trip): MapRouteRequest {
  if (!validId(trip.id) || !validText(trip.origin, 160) || !trip.destination || !validText(trip.destination, 160)) {
    throw new Error('Map route V1 requires a valid trip with origin and destination.');
  }

  const points: MapRouteRequestPoint[] = [
    { id: 'origin', role: 'origin', label: trip.origin },
    { id: 'destination', role: 'destination', label: trip.destination },
  ];

  for (const point of trip.mapPoints.slice(0, 32)) {
    if (!validId(point.id) || !validText(point.label, 160)) continue;
    const coordinate = point.latitude !== undefined && point.longitude !== undefined
      ? { latitude: point.latitude, longitude: point.longitude }
      : undefined;
    points.push({
      id: `waypoint:${point.id}`,
      role: 'waypoint',
      label: point.label,
      ...(coordinate && validCoordinate(coordinate) ? { coordinate } : {}),
    });
  }

  return {
    version: MAP_CONTRACT_VERSION,
    tripId: trip.id,
    tripRevision: trip.updatedAt,
    points,
  };
}

export function validateMapRouteResponse(
  candidate: unknown,
  expectedProviderId: string,
  expectedRequestId: string,
  request: MapRouteRequest,
): MapValidationError[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [{ path: '$', code: 'invalid_shape' }];
  }
  const errors: MapValidationError[] = [];
  const response = candidate as Partial<MapRouteResponse>;
  if (response.version !== MAP_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(response.providerId)) errors.push({ path: 'providerId', code: 'invalid_value' });
  else if (response.providerId !== expectedProviderId) errors.push({ path: 'providerId', code: 'provider_mismatch' });
  if (!validId(response.requestId)) errors.push({ path: 'requestId', code: 'invalid_value' });
  else if (response.requestId !== expectedRequestId) errors.push({ path: 'requestId', code: 'request_mismatch' });
  if (typeof response.retrievedAt !== 'string' || !Number.isFinite(Date.parse(response.retrievedAt))) {
    errors.push({ path: 'retrievedAt', code: 'invalid_value' });
  }
  if (response.validUntil !== undefined) {
    if (typeof response.validUntil !== 'string' || !Number.isFinite(Date.parse(response.validUntil))) {
      errors.push({ path: 'validUntil', code: 'invalid_value' });
    }
  }
  if (!Array.isArray(response.points) || response.points.length > 64) errors.push({ path: 'points', code: 'invalid_shape' });
  if (!Array.isArray(response.routes) || response.routes.length > 16) errors.push({ path: 'routes', code: 'invalid_shape' });
  if (!Array.isArray(response.attributions) || response.attributions.length > 8) errors.push({ path: 'attributions', code: 'invalid_shape' });
  if (errors.length > 0) return errors;

  const requestById = new Map(request.points.map((point) => [point.id, point]));
  const points = response.points as MapResolvedPoint[];
  if (new Set(points.map((point) => point.id)).size !== points.length) errors.push({ path: 'points', code: 'duplicate_id' });
  for (const [index, point] of points.entries()) {
    const prefix = `points[${index}]`;
    if (!validId(point.id) || !validId(point.requestPointId) || !validText(point.label, 160) || !validCoordinate(point.coordinate)) {
      errors.push({ path: prefix, code: 'invalid_value' });
      continue;
    }
    const requested = requestById.get(point.requestPointId);
    if (!requested) {
      errors.push({ path: `${prefix}.requestPointId`, code: 'request_point_mismatch' });
      continue;
    }
    if (!['provided', 'provider_resolved'].includes(point.resolution)) errors.push({ path: `${prefix}.resolution`, code: 'invalid_value' });
    if (point.resolution === 'provided') {
      if (!requested.coordinate
        || requested.coordinate.latitude !== point.coordinate.latitude
        || requested.coordinate.longitude !== point.coordinate.longitude) {
        errors.push({ path: `${prefix}.coordinate`, code: 'coordinate_mismatch' });
      }
    }
  }

  const pointIds = new Set(points.map((point) => point.id));
  const routes = response.routes as MapRouteGeometry[];
  if (new Set(routes.map((route) => route.id)).size !== routes.length) errors.push({ path: 'routes', code: 'duplicate_id' });
  for (const [index, route] of routes.entries()) {
    const prefix = `routes[${index}]`;
    if (!validId(route.id) || !Array.isArray(route.pointIds) || route.pointIds.length < 2 || route.pointIds.length > 64) {
      errors.push({ path: prefix, code: 'invalid_value' });
      continue;
    }
    if (route.pointIds.some((id) => !pointIds.has(id))) errors.push({ path: `${prefix}.pointIds`, code: 'request_point_mismatch' });
    if (!Array.isArray(route.geometry) || route.geometry.length < 2 || route.geometry.length > 4096 || route.geometry.some((point) => !validCoordinate(point))) {
      errors.push({ path: `${prefix}.geometry`, code: 'invalid_shape' });
    }
    if (route.distanceMeters !== undefined && (!Number.isSafeInteger(route.distanceMeters) || route.distanceMeters < 0)) {
      errors.push({ path: `${prefix}.distanceMeters`, code: 'invalid_value' });
    }
    if (route.durationSeconds !== undefined && (!Number.isSafeInteger(route.durationSeconds) || route.durationSeconds < 0)) {
      errors.push({ path: `${prefix}.durationSeconds`, code: 'invalid_value' });
    }
    if (route.sourceUrl !== undefined && !validHttpsUrl(route.sourceUrl)) errors.push({ path: `${prefix}.sourceUrl`, code: 'invalid_value' });
  }

  for (const [index, attribution] of (response.attributions as MapAttribution[]).entries()) {
    if (!validText(attribution.text, 300)) errors.push({ path: `attributions[${index}].text`, code: 'invalid_value' });
    if (attribution.url !== undefined && !validHttpsUrl(attribution.url)) errors.push({ path: `attributions[${index}].url`, code: 'invalid_value' });
  }

  return errors;
}

export function evaluateMapResponsePolicy(response: MapRouteResponse, now = new Date()): MapResponsePolicy {
  if (response.validUntil === undefined) return { freshness: 'unspecified', routeAuthoritative: false };
  const freshness = Date.parse(response.validUntil) >= now.getTime() ? 'current' : 'expired';
  return { freshness, routeAuthoritative: freshness === 'current' };
}
