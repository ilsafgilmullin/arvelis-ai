import type { Trip } from './domain';
import { isTripForOwner } from './validation';

const STORAGE_PREFIX = 'arvelis.travel.v1';
const STORAGE_VERSION = 1;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type PersistedTrips = {
  version: 1;
  ownerScopeId: string;
  trips: Trip[];
};

function storageKey(ownerScopeId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(ownerScopeId)}`;
}

export class TripRepository {
  constructor(private readonly ownerScopeId: string, private readonly storage: KeyValueStorage) {
    if (!ownerScopeId.trim()) throw new Error('Trip repository owner scope is required.');
  }

  list(): Trip[] {
    const raw = this.storage.getItem(storageKey(this.ownerScopeId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedTrips>;
      if (parsed.version !== STORAGE_VERSION || parsed.ownerScopeId !== this.ownerScopeId || !Array.isArray(parsed.trips)) {
        return [];
      }
      return parsed.trips.filter((trip) => isTripForOwner(trip, this.ownerScopeId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  get(tripId: string): Trip | null {
    return this.list().find((trip) => trip.id === tripId) ?? null;
  }

  save(trip: Trip): void {
    if (trip.ownerScopeId !== this.ownerScopeId) throw new Error('Trip ownership mismatch.');
    const existing = this.list();
    const next = [trip, ...existing.filter((item) => item.id !== trip.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const payload: PersistedTrips = { version: STORAGE_VERSION, ownerScopeId: this.ownerScopeId, trips: next };
    this.storage.setItem(storageKey(this.ownerScopeId), JSON.stringify(payload));
  }

  clear(): void {
    this.storage.removeItem(storageKey(this.ownerScopeId));
  }
}

export function createBrowserTripRepository(ownerScopeId: string): TripRepository {
  if (typeof window === 'undefined') throw new Error('Browser storage is unavailable.');
  return new TripRepository(ownerScopeId, window.localStorage);
}

export function canUseTravelStorage(): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${STORAGE_PREFIX}:probe`;
  try {
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function clearBrowserTrips(ownerScopeId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    new TripRepository(ownerScopeId, window.localStorage).clear();
    return true;
  } catch {
    return false;
  }
}
