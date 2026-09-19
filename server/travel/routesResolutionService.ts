import type { LocationResolutionQueryV1 } from '../../src/travel/locationResolution';
import type { LocationDirectoryContext, LocationResolutionOutcome } from './locationResolutionService';
import { prepareRoutesLocationsForYandexRasp, type RoutesLocationBoundaryOutcome } from './routesLocationBoundary';
import type { YandexLocationBindings } from './providers/yandexRaspSearchMapping';

export type RoutesResolutionRequestV1 = {
  version: 1;
  origin: string;
  destination: string;
  locale: 'ru-RU';
  countryCode: 'RU';
};

export interface RoutesLocationResolver {
  resolve(
    input: unknown,
    context: Omit<LocationDirectoryContext, 'signal'> & { signal: AbortSignal },
  ): Promise<LocationResolutionOutcome>;
}

export type RoutesResolutionServiceOutcome = RoutesLocationBoundaryOutcome;

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
  if (keys.length !== 5 || !keys.every((key) => ['version', 'origin', 'destination', 'locale', 'countryCode'].includes(key))) return false;
  const validLabel = (label: unknown) => typeof label === 'string'
    && label.length > 0
    && label.length <= 160
    && label.trim() === label
    && !/[\u0000-\u001f\u007f]/u.test(label);
  return record.version === 1
    && validLabel(record.origin)
    && validLabel(record.destination)
    && record.locale === 'ru-RU'
    && record.countryCode === 'RU';
}

/**
 * Resolves free-form route labels through the active ARVELIS directory and only then
 * joins the resulting trusted ARVELIS identities to server-owned provider bindings.
 * Provider codes are never accepted in this request contract.
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

    const origin = await this.#resolver.resolve(locationQuery(input.origin), context);
    if (!('response' in origin) || origin.status !== 'resolved') {
      return prepareRoutesLocationsForYandexRasp(origin, { status: 'not_executed', code: 'aborted' }, this.#bindings);
    }
    if (context.signal.aborted) {
      return { status: 'blocked', field: 'destination', code: 'location_resolution_failed' };
    }

    const destination = await this.#resolver.resolve(locationQuery(input.destination), context);
    return prepareRoutesLocationsForYandexRasp(origin, destination, this.#bindings);
  }
}
