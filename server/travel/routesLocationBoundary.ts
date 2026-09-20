import type { TravelLocationCandidateV1 } from '../../src/travel/locationResolution';
import type { LocationResolutionOutcome } from './locationResolutionService';
import {
  bindTrustedLocationToYandexRasp,
  type TrustedProviderLocationBinding,
} from './providers/trustedLocationProviderBinding';
import type { YandexLocationBindings } from './providers/yandexRaspSearchMapping';

export type RoutesLocationBoundaryFailureCode =
  | 'location_unresolved'
  | 'location_ambiguous'
  | 'provider_binding_missing'
  | 'location_resolution_failed';

export type RoutesLocationBoundaryOutcome =
  | {
      status: 'ready';
      origin: TrustedProviderLocationBinding;
      destination: TrustedProviderLocationBinding;
      originLocation: TravelLocationCandidateV1;
      destinationLocation: TravelLocationCandidateV1;
    }
  | {
      status: 'needs_disambiguation';
      field: 'origin' | 'destination';
      code: 'location_ambiguous';
      candidates: TravelLocationCandidateV1[];
    }
  | {
      status: 'blocked';
      field: 'origin' | 'destination';
      code: Exclude<RoutesLocationBoundaryFailureCode, 'location_ambiguous'>;
    };

function bindResolvedLocation(
  field: 'origin' | 'destination',
  outcome: LocationResolutionOutcome,
  bindings: YandexLocationBindings,
):
  | { status: 'ready'; binding: TrustedProviderLocationBinding; location: TravelLocationCandidateV1 }
  | Exclude<RoutesLocationBoundaryOutcome, { status: 'ready' }> {
  if (!('response' in outcome)) {
    return { status: 'blocked', field, code: 'location_resolution_failed' };
  }
  if (outcome.status === 'ambiguous') {
    return {
      status: 'needs_disambiguation',
      field,
      code: 'location_ambiguous',
      candidates: structuredClone(outcome.response.candidates),
    };
  }

  const bound = bindTrustedLocationToYandexRasp(outcome.response.candidates, bindings);
  if (bound.status === 'bound') {
    const location = outcome.response.candidates[0];
    if (!location || location.locationId !== bound.binding.locationId) {
      return { status: 'blocked', field, code: 'location_resolution_failed' };
    }
    return { status: 'ready', binding: bound.binding, location: structuredClone(location) };
  }
  if (bound.status === 'ambiguous') {
    return {
      status: 'needs_disambiguation',
      field,
      code: 'location_ambiguous',
      candidates: structuredClone(outcome.response.candidates),
    };
  }
  return { status: 'blocked', field, code: bound.code };
}

/**
 * Joins trusted resolver outcomes to server-owned provider bindings for Routes.
 * It never chooses among multiple candidates and never accepts provider codes from clients.
 * Provider-neutral candidate metadata is retained server-side for the subsequent
 * TransportSearchRequest construction; the HTTP boundary still exposes only ARVELIS IDs.
 */
export function prepareRoutesLocationsForYandexRasp(
  origin: LocationResolutionOutcome,
  destination: LocationResolutionOutcome,
  bindings: YandexLocationBindings,
): RoutesLocationBoundaryOutcome {
  const originBinding = bindResolvedLocation('origin', origin, bindings);
  if (originBinding.status !== 'ready') return originBinding;

  const destinationBinding = bindResolvedLocation('destination', destination, bindings);
  if (destinationBinding.status !== 'ready') return destinationBinding;

  if (originBinding.binding.locationId === destinationBinding.binding.locationId) {
    return { status: 'blocked', field: 'destination', code: 'location_unresolved' };
  }

  return {
    status: 'ready',
    origin: originBinding.binding,
    destination: destinationBinding.binding,
    originLocation: originBinding.location,
    destinationLocation: destinationBinding.location,
  };
}
