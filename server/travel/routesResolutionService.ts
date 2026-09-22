import type { LocationResolutionQueryV1, TravelLocationCandidateV1 } from '../../src/travel/locationResolution';
import type { LocationDirectoryContext, LocationResolutionOutcome } from './locationResolutionService';
import { prepareRoutesLocationsForYandexRasp, type RoutesLocationBoundaryOutcome } from './routesLocationBoundary';
import type { YandexLocationBindings } from './providers/yandexRaspSearchMapping';

export type RoutesResolutionRequestV1 = {
  version: 1;
  origin: string;
  destination: string;
  locale: 'ru-RU';
  countryCode: 'RU';
  originLocationId?: string;
  destinationLocationId?: string;
};

export interface RoutesLocationResolver {
  resolve(
    input: unknown,
    context: Omit<LocationDirectoryContext, 'signal'> & { signal: AbortSignal },
  ): Promise<LocationResolutionOutcome>;
}

export type RoutesResolutionServiceOutcome = RoutesLocationBoundaryOutcome;

const LOCATION_ID = /^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

function locationQuery(label: string): LocationResolutionQueryV1 {
  return {
    version: 1,
    rawLabel: label,
    locale: 'ru-RU',
    countryCode: 'RU',
    limit: 10,
  };
}

function validRequest(value: unknown): value is RoutesResolutionRequestV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length < 5 || keys.length > 7 || !keys.every((key) => ['version', 'origin', 'destination', 'locale', 'countryCode', 'originLocationId', 'destinationLocationId'].includes(key))) return false;
  const validLabel = (label: unknown) => typeof label === 'string'
    && label.length > 0
    && label.length <= 160
    && label.trim() === label
    && !/[\u0000-\u001f\u007f]/u.test(label);
  const validLocationId = (locationId: unknown) => locationId === undefined
    || (typeof locationId === 'string' && LOCATION_ID.test(locationId));
  return record.version === 1
    && validLabel(record.origin)
    && validLabel(record.destination)
    && record.locale === 'ru-RU'
    && record.countryCode === 'RU'
    && validLocationId(record.originLocationId)
    && validLocationId(record.destinationLocationId);
}

/**
 * Applies an explicit provider-neutral ARVELIS location selection to a fresh directory
 * result. A client can only select an ID that the server resolver returned for the same
 * label in this request; provider codes and stale/invented IDs never become trusted.
 */
function applyExplicitSelection(
  outcome: LocationResolutionOutcome,
  selectedLocationId: string | undefined,
): LocationResolutionOutcome {
  if (selectedLocationId === undefined || !('response' in outcome)) return outcome;
  if (outcome.status === 'unresolved') return outcome;

  const selected = outcome.response.candidates.find((candidate) => candidate.locationId === selectedLocationId);
  if (!selected) return outcome;

  const candidate: TravelLocationCandidateV1 = structuredClone(selected);
  return {
    status: 'resolved',
    response: {
      ...structuredClone(outcome.response),
      status: 'resolved',
      candidates: [candidate],
    },
  };
}

/**
 * Resolves free-form route labels through the active ARVELIS directory and only then
 * joins the resulting trusted ARVELIS identities to server-owned provider bindings.
 * Ambiguous results require an explicit ARVELIS locationId that is revalidated against
 * the fresh server-side candidate set. Provider codes are never accepted.
 */
export class RoutesResolutionService {
  readonly #resolver: RoutesLocationResolver;
  readonly #bindings: YandexLocationBindings;

  constructor(resolver: RoutesLocationResolver, bindings: YandexLocationBindings) {
    this.#resolver = resolver;
    this.#bindings = bindings;
  }

  async resolve(
    input: unknown,
    context: Omit<LocationDirectoryContext, 'signal'> & { signal: AbortSignal },
  ): Promise<RoutesResolutionServiceOutcome> {
    if (!validRequest(input) || context.signal.aborted) {
      return { status: 'blocked', field: 'origin', code: 'location_resolution_failed' };
    }

    const originRaw = await this.#resolver.resolve(locationQuery(input.origin), context);
    const origin = applyExplicitSelection(originRaw, input.originLocationId);
    if (!('response' in origin) || origin.status !== 'resolved') {
      return prepareRoutesLocationsForYandexRasp(origin, { status: 'not_executed', code: 'aborted' }, this.#bindings);
    }
    if (context.signal.aborted) {
      return { status: 'blocked', field: 'destination', code: 'location_resolution_failed' };
    }

    const destinationRaw = await this.#resolver.resolve(locationQuery(input.destination), context);
    const destination = applyExplicitSelection(destinationRaw, input.destinationLocationId);
    return prepareRoutesLocationsForYandexRasp(origin, destination, this.#bindings);
  }
}
