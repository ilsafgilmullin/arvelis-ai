import { candidateToTransportSearchLocation } from '../../src/travel/locationResolution';
import {
  validateTransportSearchRequestV1,
  type TransportSearchRequestV1,
  type TransportSearchIssue,
} from '../../src/travel/transportSearchRequest';
import type { RoutesLocationBoundaryOutcome } from './routesLocationBoundary';

export type RoutesTransportSearchParametersV1 = {
  departureDate: string;
  returnDate?: string;
  adults: number;
};

export type RoutesTransportSearchRequestBuildOutcome =
  | { status: 'ready'; request: TransportSearchRequestV1 }
  | { status: 'blocked'; code: 'invalid_search_request' | 'location_metadata_incomplete'; issues?: TransportSearchIssue[] };

/**
 * Builds the provider-neutral TransportSearchRequest only after Routes location resolution
 * and server-owned provider binding have succeeded. Location identities and timezone are
 * taken from trusted directory candidates, never from client/model input.
 */
export function buildRoutesTransportSearchRequest(input: {
  resolutionRequest: { origin: string; destination: string };
  locations: Extract<RoutesLocationBoundaryOutcome, { status: 'ready' }>;
  search: RoutesTransportSearchParametersV1;
  now?: Date;
}): RoutesTransportSearchRequestBuildOutcome {
  const timezone = input.locations.originLocation.timezone;
  if (!timezone) return { status: 'blocked', code: 'location_metadata_incomplete' };

  let origin;
  let destination;
  try {
    origin = candidateToTransportSearchLocation(input.resolutionRequest.origin, input.locations.originLocation);
    destination = candidateToTransportSearchLocation(input.resolutionRequest.destination, input.locations.destinationLocation);
  } catch {
    return { status: 'blocked', code: 'location_metadata_incomplete' };
  }

  const candidate: TransportSearchRequestV1 = {
    version: 1,
    origin,
    destination,
    departureDate: input.search.departureDate,
    ...(input.search.returnDate === undefined ? {} : { returnDate: input.search.returnDate }),
    passengers: { adults: input.search.adults },
    locale: 'ru-RU',
    timezone,
    preferredCurrency: 'RUB',
  };

  const validation = validateTransportSearchRequestV1(candidate, input.now ?? new Date());
  if (!validation.ok) return { status: 'blocked', code: 'invalid_search_request', issues: validation.issues };
  return { status: 'ready', request: validation.request };
}
