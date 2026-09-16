import type { Trip } from '../../src/travel/domain';
import { validateTransportSearchRequestV1, type TransportSearchRequestV1 } from '../../src/travel/transportSearchRequest';
import { TransportSearchService, type TransportSearchFailureCode, type TransportSearchOutcome } from './transportSearchService';

export type TripBoundTransportFailureCode =
  | 'invalid_search_request'
  | 'trip_not_ready'
  | 'trip_mismatch'
  | TransportSearchFailureCode;

export type TripBoundTransportSearchResult =
  | { status: 'results' | 'no_results'; response: Extract<TransportSearchOutcome, { response: unknown }>['response'] }
  | { status: 'not_executed' | 'failed'; code: TripBoundTransportFailureCode };

export type TransportHttpFailure = {
  statusCode: number;
  body: {
    status: 'not_executed' | 'failed';
    error: {
      code: TripBoundTransportFailureCode;
      message: string;
    };
  };
};

function canonicalLabel(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

function tripCanSearchTransport(trip: Trip): boolean {
  return Boolean(
    trip.destination
    && !trip.preferences.destinationUnknown
    && !trip.preferences.flexibleDates
    && trip.startDate
    && trip.endDate
    && trip.travelers.length >= 1
    && trip.travelers.length <= 9,
  );
}

function requestMatchesTrip(request: TransportSearchRequestV1, trip: Trip): boolean {
  if (!trip.destination || !trip.startDate || !trip.endDate) return false;
  return canonicalLabel(request.origin.rawLabel) === canonicalLabel(trip.origin)
    && canonicalLabel(request.destination.rawLabel) === canonicalLabel(trip.destination)
    && request.departureDate === trip.startDate
    && request.returnDate === trip.endDate
    && request.passengers.adults === trip.travelers.length;
}

/**
 * User-facing transport searches must remain bound to the already-authorized persisted
 * Trip. A client may carry an ARVELIS location identity, but it cannot alter the trip's
 * route, dates or passenger count while reusing that Trip authorization boundary.
 */
export async function searchTransportForAuthorizedTrip(options: {
  service: TransportSearchService;
  accountScopeId: string;
  trip: Trip;
  input: unknown;
  requestId: string;
  signal: AbortSignal;
  now?: Date;
}): Promise<TripBoundTransportSearchResult> {
  const { service, accountScopeId, trip, input, requestId, signal } = options;
  if (trip.ownerScopeId !== accountScopeId) return { status: 'not_executed', code: 'access_denied' };
  if (!tripCanSearchTransport(trip)) return { status: 'not_executed', code: 'trip_not_ready' };

  const validation = validateTransportSearchRequestV1(input, options.now ?? new Date());
  if (!validation.ok) return { status: 'not_executed', code: validation.issues[0]?.code ?? 'invalid_search_request' };
  if (!requestMatchesTrip(validation.request, trip)) return { status: 'not_executed', code: 'trip_mismatch' };

  const outcome = await service.search(validation.request, {
    accountScopeId,
    authorizedTripId: trip.id,
    requestId,
    signal,
  });
  if ('response' in outcome) {
    return { status: outcome.status, response: structuredClone(outcome.response) };
  }
  return { status: outcome.status, code: outcome.code };
}

export function transportHttpFailure(result: Extract<TripBoundTransportSearchResult, { code: TripBoundTransportFailureCode }>): TransportHttpFailure {
  const message = (() => {
    switch (result.code) {
      case 'trip_not_ready': return 'Trip is not ready for transport search';
      case 'trip_mismatch': return 'Transport request does not match the authorized Trip';
      case 'provider_not_configured': return 'Transport provider is not configured';
      case 'provider_timeout': return 'Transport provider timed out';
      case 'provider_rate_limited': return 'Transport provider rate limit reached';
      case 'provider_unavailable':
      case 'provider_unauthorized': return 'Transport provider unavailable';
      case 'malformed_provider_response': return 'Transport provider response rejected';
      case 'access_denied': return 'Transport search access denied';
      case 'aborted': return 'Transport search cancelled';
      default: return 'Transport search request cannot be executed';
    }
  })();

  let statusCode = 422;
  if (result.code === 'access_denied') statusCode = 403;
  else if (result.code === 'provider_rate_limited') statusCode = 429;
  else if (result.code === 'provider_timeout') statusCode = 504;
  else if (result.code === 'malformed_provider_response') statusCode = 502;
  else if (result.code === 'provider_not_configured' || result.code === 'provider_unavailable' || result.code === 'provider_unauthorized') statusCode = 503;
  else if (result.code === 'aborted') statusCode = 408;

  return {
    statusCode,
    body: {
      status: result.status,
      error: { code: result.code, message },
    },
  };
}
