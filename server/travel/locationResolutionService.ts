import {
  LOCATION_RESOLUTION_VERSION,
  MAX_LOCATION_CANDIDATES,
  validLocationResolutionResponseV1,
  validTravelLocationCandidateV1,
  validateLocationResolutionQueryV1,
  type LocationResolutionQueryV1,
  type LocationResolutionResponseV1,
  type TravelLocationCandidateV1,
} from '../../src/travel/locationResolution';

export type LocationDirectoryContext = {
  accountScopeId: string;
  requestId: string;
  signal: AbortSignal;
};

/**
 * Provider-neutral port. Implementations may use an internal curated directory or an
 * approved external source, but must return ARVELIS identities rather than provider codes.
 */
export interface TravelLocationDirectory {
  readonly id: string;
  readonly revision: string;
  resolve(query: LocationResolutionQueryV1, context: LocationDirectoryContext): Promise<unknown>;
}

export type LocationDirectoryErrorCode = 'rate_limited' | 'unavailable';

export class LocationDirectoryError extends Error {
  constructor(readonly code: LocationDirectoryErrorCode) {
    super(code);
    this.name = 'LocationDirectoryError';
  }
}

export type LocationResolutionFailureCode =
  | 'invalid_location_query'
  | 'resolver_not_configured'
  | 'resolver_timeout'
  | 'resolver_rate_limited'
  | 'resolver_unavailable'
  | 'malformed_resolver_response'
  | 'aborted';

export type LocationResolutionOutcome =
  | { status: 'resolved' | 'ambiguous' | 'unresolved'; response: LocationResolutionResponseV1 }
  | { status: 'not_executed' | 'failed'; code: LocationResolutionFailureCode };

export type LocationResolutionServiceOptions = {
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 15_000;

function validTimeout(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TIMEOUT_MS && value <= MAX_TIMEOUT_MS;
}

function candidatesFromUnknown(value: unknown, limit: number): TravelLocationCandidateV1[] | null {
  if (!Array.isArray(value) || value.length > limit || value.length > MAX_LOCATION_CANDIDATES) return null;
  if (!value.every(validTravelLocationCandidateV1)) return null;
  const candidates = structuredClone(value) as TravelLocationCandidateV1[];
  if (new Set(candidates.map((candidate) => candidate.locationId)).size !== candidates.length) return null;
  return candidates;
}

export class LocationResolutionService {
  readonly #directory: TravelLocationDirectory | null;
  readonly #timeoutMs: number;

  constructor(directory: TravelLocationDirectory | null, options: LocationResolutionServiceOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!validTimeout(timeoutMs)) throw new Error('Invalid location resolution timeout');
    this.#directory = directory;
    this.#timeoutMs = timeoutMs;
  }

  async resolve(
    input: unknown,
    context: Omit<LocationDirectoryContext, 'signal'> & { signal: AbortSignal },
  ): Promise<LocationResolutionOutcome> {
    if (context.signal.aborted) return { status: 'not_executed', code: 'aborted' };
    const validation = validateLocationResolutionQueryV1(input);
    if (!validation.ok) return { status: 'not_executed', code: 'invalid_location_query' };
    if (!this.#directory) return { status: 'not_executed', code: 'resolver_not_configured' };

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    context.signal.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const raw = await this.#directory.resolve(validation.query, {
        accountScopeId: context.accountScopeId,
        requestId: context.requestId,
        signal: controller.signal,
      });
      if (context.signal.aborted) return { status: 'failed', code: 'aborted' };
      if (timedOut) return { status: 'failed', code: 'resolver_timeout' };

      const limit = validation.query.limit ?? MAX_LOCATION_CANDIDATES;
      const candidates = candidatesFromUnknown(raw, limit);
      if (!candidates) return { status: 'failed', code: 'malformed_resolver_response' };

      const status = candidates.length === 0 ? 'unresolved' : candidates.length === 1 ? 'resolved' : 'ambiguous';
      const response: LocationResolutionResponseV1 = {
        version: LOCATION_RESOLUTION_VERSION,
        status,
        rawLabel: validation.query.rawLabel,
        directoryId: this.#directory.id,
        directoryRevision: this.#directory.revision,
        candidates,
      };
      if (!validLocationResolutionResponseV1(response)) return { status: 'failed', code: 'malformed_resolver_response' };
      return { status, response };
    } catch (error) {
      if (context.signal.aborted) return { status: 'failed', code: 'aborted' };
      if (timedOut || controller.signal.aborted) return { status: 'failed', code: 'resolver_timeout' };
      if (error instanceof LocationDirectoryError) {
        return error.code === 'rate_limited'
          ? { status: 'failed', code: 'resolver_rate_limited' }
          : { status: 'failed', code: 'resolver_unavailable' };
      }
      return { status: 'failed', code: 'resolver_unavailable' };
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener('abort', abortFromCaller);
    }
  }
}
