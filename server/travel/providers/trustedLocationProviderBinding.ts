import type { TravelLocationCandidateV1 } from '../../../src/travel/locationResolution';
import type { YandexLocationBindings } from './yandexRaspSearchMapping';

export type TrustedProviderLocationBinding = {
  locationId: string;
  searchCode: string;
  stationCodes: readonly string[];
};

export type TrustedProviderBindingOutcome =
  | { status: 'bound'; binding: TrustedProviderLocationBinding }
  | { status: 'unresolved'; code: 'location_unresolved' | 'provider_binding_missing' }
  | { status: 'ambiguous'; code: 'location_ambiguous' };

/**
 * Binds exactly one trusted ARVELIS location identity to server-controlled provider codes.
 * Provider codes never come from user/model input and no candidate is selected implicitly.
 */
export function bindTrustedLocationToYandexRasp(
  candidates: readonly TravelLocationCandidateV1[],
  bindings: YandexLocationBindings,
): TrustedProviderBindingOutcome {
  if (candidates.length === 0) {
    return { status: 'unresolved', code: 'location_unresolved' };
  }
  if (candidates.length !== 1) {
    return { status: 'ambiguous', code: 'location_ambiguous' };
  }

  const candidate = candidates[0];
  if (!candidate) {
    return { status: 'unresolved', code: 'location_unresolved' };
  }
  const providerBinding = bindings.get(candidate.locationId);
  if (!providerBinding) {
    return { status: 'unresolved', code: 'provider_binding_missing' };
  }

  return {
    status: 'bound',
    binding: {
      locationId: candidate.locationId,
      searchCode: providerBinding.searchCode,
      stationCodes: Object.freeze([...providerBinding.stationCodes]),
    },
  };
}
