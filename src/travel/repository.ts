import type { Trip } from './domain';
import { isTripForOwner } from './validation';
import { TripRepository, canUseTravelStorage, createBrowserTripRepository } from './storage';

export type TripPersistenceMode = 'local' | 'server';

export interface TravelTripRepository {
  list(): Promise<Trip[]>;
  get(tripId: string): Promise<Trip | null>;
  save(trip: Trip): Promise<Trip>;
}

export class TravelTripRepositoryError extends Error {
  constructor(readonly code: 'authentication_required' | 'unavailable' | 'invalid_response' | 'ownership_mismatch') {
    super(code);
    this.name = 'TravelTripRepositoryError';
  }
}

class LocalTravelTripRepository implements TravelTripRepository {
  constructor(private readonly repository: TripRepository) {}

  async list(): Promise<Trip[]> {
    return this.repository.list();
  }

  async get(tripId: string): Promise<Trip | null> {
    return this.repository.get(tripId);
  }

  async save(trip: Trip): Promise<Trip> {
    this.repository.save(trip);
    return trip;
  }
}

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Arvelis-Request': '1',
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new TravelTripRepositoryError('invalid_response');
  }
  return response.json() as Promise<unknown>;
}

function mapFailure(response: Response): never {
  if (response.status === 401 || response.status === 403) {
    throw new TravelTripRepositoryError('authentication_required');
  }
  if (response.status >= 500) throw new TravelTripRepositoryError('unavailable');
  throw new TravelTripRepositoryError('invalid_response');
}

export class HttpTravelTripRepository implements TravelTripRepository {
  constructor(private readonly ownerScopeId: string) {
    if (!ownerScopeId.trim()) throw new Error('Trip repository owner scope is required.');
  }

  async list(): Promise<Trip[]> {
    const response = await fetch('/api/trips', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) mapFailure(response);
    const body = asRecord(await readJson(response));
    const trips = body?.trips;
    if (!Array.isArray(trips) || !trips.every((trip) => isTripForOwner(trip, this.ownerScopeId))) {
      throw new TravelTripRepositoryError('invalid_response');
    }
    return [...trips].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(tripId: string): Promise<Trip | null> {
    const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 404) return null;
    if (!response.ok) mapFailure(response);
    const body = asRecord(await readJson(response));
    const trip = body?.trip;
    if (!isTripForOwner(trip, this.ownerScopeId)) throw new TravelTripRepositoryError('invalid_response');
    return trip;
  }

  async save(trip: Trip): Promise<Trip> {
    if (trip.ownerScopeId !== this.ownerScopeId) throw new TravelTripRepositoryError('ownership_mismatch');
    const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: JSON_HEADERS,
      cache: 'no-store',
      body: JSON.stringify({ trip }),
    });
    if (!response.ok) mapFailure(response);
    const body = asRecord(await readJson(response));
    const saved = body?.trip;
    if (!isTripForOwner(saved, this.ownerScopeId)) throw new TravelTripRepositoryError('invalid_response');
    return saved;
  }
}

export function createTravelTripRepository(ownerScopeId: string, mode: TripPersistenceMode): TravelTripRepository {
  if (mode === 'server') return new HttpTravelTripRepository(ownerScopeId);
  return new LocalTravelTripRepository(createBrowserTripRepository(ownerScopeId));
}

export function canUseTripPersistence(mode: TripPersistenceMode): boolean {
  return mode === 'server' ? true : canUseTravelStorage();
}
