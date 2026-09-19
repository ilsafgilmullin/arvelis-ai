import type { LocationResolutionQueryV1 } from '../../src/travel/locationResolution';
import type { LocationDirectoryActivationRepository } from './locationDirectoryActivation';
import {
  RepositoryTravelLocationDirectory,
  type LocationDirectoryRepository,
  type LocationDirectorySourceV1,
} from './locationDirectoryFoundation';
import {
  LocationResolutionService,
  type LocationDirectoryContext,
  type LocationResolutionOutcome,
  type LocationResolutionServiceOptions,
} from './locationResolutionService';

export type ActiveLocationResolutionServiceOptions = LocationResolutionServiceOptions & {
  directoryId: string;
  source: LocationDirectorySourceV1;
  countryCode: string;
};

/**
 * Runtime-safe location resolver. A registered/imported revision is never readable here
 * until it has been explicitly activated for the configured source/country pair.
 *
 * The active pointer is read for every request so activation/rollback takes effect without
 * restarting the process. Missing or inconsistent activation fails closed.
 */
export class ActiveLocationResolutionService {
  readonly #repository: LocationDirectoryRepository;
  readonly #activation: LocationDirectoryActivationRepository;
  readonly #options: ActiveLocationResolutionServiceOptions;

  constructor(
    repository: LocationDirectoryRepository,
    activation: LocationDirectoryActivationRepository,
    options: ActiveLocationResolutionServiceOptions,
  ) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(options.directoryId)
      || options.source !== 'geonames'
      || !/^[A-Z]{2}$/.test(options.countryCode)) {
      throw new Error('Invalid active location resolution configuration');
    }
    this.#repository = repository;
    this.#activation = activation;
    this.#options = { ...options };
  }

  async resolve(
    input: unknown,
    context: Omit<LocationDirectoryContext, 'signal'> & { signal: AbortSignal },
  ): Promise<LocationResolutionOutcome> {
    if (context.signal.aborted) return { status: 'not_executed', code: 'aborted' };

    const query = input as Partial<LocationResolutionQueryV1> | null;
    if (query && typeof query === 'object' && query.countryCode !== undefined && query.countryCode !== this.#options.countryCode) {
      return { status: 'not_executed', code: 'resolver_not_configured' };
    }

    let active;
    try {
      active = await this.#activation.getActive(this.#options.source, this.#options.countryCode);
    } catch {
      return { status: 'failed', code: 'resolver_unavailable' };
    }
    if (!active) return { status: 'not_executed', code: 'resolver_not_configured' };

    let revision;
    try {
      revision = await this.#repository.getRevision(active.source, active.revision);
    } catch {
      return { status: 'failed', code: 'resolver_unavailable' };
    }
    if (!revision
      || revision.source !== active.source
      || revision.revision !== active.revision
      || revision.countryCode !== active.countryCode
      || active.countryCode !== this.#options.countryCode) {
      return { status: 'failed', code: 'resolver_unavailable' };
    }

    const directory = new RepositoryTravelLocationDirectory(this.#repository, {
      id: this.#options.directoryId,
      source: active.source,
      revision: active.revision,
    });
    const service = new LocationResolutionService(directory, { timeoutMs: this.#options.timeoutMs });
    return service.resolve(input, context);
  }
}
