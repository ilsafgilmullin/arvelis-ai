import type { LocationDirectoryRevisionV1, LocationDirectorySourceV1 } from './locationDirectoryFoundation';

export type ActiveLocationDirectoryRevisionV1 = {
  version: 1;
  source: LocationDirectorySourceV1;
  countryCode: string;
  revision: string;
  activatedAt: string;
  previousRevision: string | null;
};

export type ActivateLocationDirectoryRevisionV1 = {
  source: LocationDirectorySourceV1;
  countryCode: string;
  revision: string;
  expectedCurrentRevision: string | null;
  activatedAt: string;
};

export interface LocationDirectoryActivationRepository {
  getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null>;
  getActive(source: LocationDirectorySourceV1, countryCode: string): Promise<ActiveLocationDirectoryRevisionV1 | null>;
  activate(input: ActivateLocationDirectoryRevisionV1): Promise<ActiveLocationDirectoryRevisionV1>;
}

function validInstant(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validRevision(value: string): boolean {
  return value.length >= 1
    && value.length <= 128
    && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value);
}

export function validateActivateLocationDirectoryRevisionV1(input: ActivateLocationDirectoryRevisionV1): boolean {
  return input.source === 'geonames'
    && /^[A-Z]{2}$/.test(input.countryCode)
    && validRevision(input.revision)
    && (input.expectedCurrentRevision === null || validRevision(input.expectedCurrentRevision))
    && validInstant(input.activatedAt);
}

/**
 * Coordinates an explicit, compare-and-swap activation. Importing/registering a revision
 * never makes it active by itself. The repository must perform the pointer update and audit
 * append atomically.
 */
export class LocationDirectoryActivationService {
  constructor(private readonly repository: LocationDirectoryActivationRepository) {}

  async activate(input: ActivateLocationDirectoryRevisionV1): Promise<ActiveLocationDirectoryRevisionV1> {
    if (!validateActivateLocationDirectoryRevisionV1(input)) {
      throw new Error('Invalid location directory activation request');
    }

    const revision = await this.repository.getRevision(input.source, input.revision);
    if (!revision) throw new Error('Location directory revision is not registered');
    if (revision.countryCode !== input.countryCode) {
      throw new Error('Location directory revision country mismatch');
    }

    return this.repository.activate(input);
  }
}

/** Reference semantics used by qualification tests only; not production persistence. */
export class InMemoryLocationDirectoryActivationRepository implements LocationDirectoryActivationRepository {
  readonly #revisions = new Map<string, LocationDirectoryRevisionV1>();
  readonly #active = new Map<string, ActiveLocationDirectoryRevisionV1>();
  readonly audit: ActiveLocationDirectoryRevisionV1[] = [];

  registerRevision(revision: LocationDirectoryRevisionV1): void {
    this.#revisions.set(`${revision.source}\u0000${revision.revision}`, structuredClone(revision));
  }

  async getRevision(source: LocationDirectorySourceV1, revision: string): Promise<LocationDirectoryRevisionV1 | null> {
    const value = this.#revisions.get(`${source}\u0000${revision}`);
    return value ? structuredClone(value) : null;
  }

  async getActive(source: LocationDirectorySourceV1, countryCode: string): Promise<ActiveLocationDirectoryRevisionV1 | null> {
    const value = this.#active.get(`${source}\u0000${countryCode}`);
    return value ? structuredClone(value) : null;
  }

  async activate(input: ActivateLocationDirectoryRevisionV1): Promise<ActiveLocationDirectoryRevisionV1> {
    const key = `${input.source}\u0000${input.countryCode}`;
    const current = this.#active.get(key) ?? null;
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== input.expectedCurrentRevision) {
      throw new Error('Location directory active revision changed');
    }
    if (currentRevision === input.revision) {
      throw new Error('Location directory revision is already active');
    }

    const next: ActiveLocationDirectoryRevisionV1 = {
      version: 1,
      source: input.source,
      countryCode: input.countryCode,
      revision: input.revision,
      activatedAt: input.activatedAt,
      previousRevision: currentRevision,
    };
    this.#active.set(key, structuredClone(next));
    this.audit.push(structuredClone(next));
    return structuredClone(next);
  }
}
