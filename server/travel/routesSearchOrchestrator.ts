import type { Trip } from '../../src/travel/domain';
import type { RoutesLocationBoundaryOutcome } from './routesLocationBoundary';
import { RoutesResolutionService, type RoutesResolutionRequestV1 } from './routesResolutionService';
import { buildRoutesTransportSearchRequest } from './routesTransportSearchRequest';
import {
  searchTransportForAuthorizedTrip,
  type TripBoundTransportSearchResult,
} from './transportSearchHttpBoundary';
import { TransportSearchService } from './transportSearchService';

export type RoutesSearchSelectionV1 = {
  originLocationId?: string;
  destinationLocationId?: string;
};

export type RoutesSearchOutcome =
  | { status: 'needs_disambiguation'; resolution: Extract<RoutesLocationBoundaryOutcome, { status: 'needs_disambiguation' }> }
  | { status: 'not_executed'; code: 'trip_not_ready' | 'location_resolution_failed' | 'location_metadata_incomplete' | 'invalid_search_request' }
  | TripBoundTransportSearchResult;

/**
 * Owns the complete server-side Routes search transition after Trip authorization.
 * Route labels, dates and passenger count come from the persisted Trip. The client may
 * only carry provider-neutral ARVELIS location selections, which RoutesResolutionService
 * revalidates against a fresh active-directory candidate set before provider binding.
 */
export async function searchRoutesForAuthorizedTrip(input: {
  resolutionService: RoutesResolutionService;
  transportService: TransportSearchService;
  accountScopeId: string;
  trip: Trip;
  selection?: RoutesSearchSelectionV1;
  requestId: string;
  signal: AbortSignal;
  now?: Date;
}): Promise<RoutesSearchOutcome> {
  const { trip } = input;
  if (
    trip.ownerScopeId !== input.accountScopeId
    || !trip.destination
    || !trip.startDate
    || !trip.endDate
    || trip.preferences.destinationUnknown
    || trip.preferences.flexibleDates
    || trip.travelers.length < 1
    || trip.travelers.length > 9
  ) {
    return { status: 'not_executed', code: 'trip_not_ready' };
  }

  const resolutionRequest: RoutesResolutionRequestV1 = {
    version: 1,
    origin: trip.origin,
    destination: trip.destination,
    locale: 'ru-RU',
    countryCode: 'RU',
    ...(input.selection?.originLocationId === undefined
      ? {}
      : { originLocationId: input.selection.originLocationId }),
    ...(input.selection?.destinationLocationId === undefined
      ? {}
      : { destinationLocationId: input.selection.destinationLocationId }),
  };

  const resolution = await input.resolutionService.resolve(resolutionRequest, {
    accountScopeId: input.accountScopeId,
    requestId: input.requestId,
    signal: input.signal,
  });
  if (resolution.status === 'needs_disambiguation') {
    return { status: 'needs_disambiguation', resolution };
  }
  if (resolution.status !== 'ready') {
    return { status: 'not_executed', code: 'location_resolution_failed' };
  }

  const built = buildRoutesTransportSearchRequest({
    resolutionRequest,
    locations: resolution,
    search: {
      departureDate: trip.startDate,
      returnDate: trip.endDate,
      adults: trip.travelers.length,
    },
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  if (built.status !== 'ready') {
    return { status: 'not_executed', code: built.code };
  }

  return searchTransportForAuthorizedTrip({
    service: input.transportService,
    accountScopeId: input.accountScopeId,
    trip,
    input: built.request,
    requestId: input.requestId,
    signal: input.signal,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
}
