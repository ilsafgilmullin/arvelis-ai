import type { Trip } from '../../src/travel/domain';
import { isSafeTripId, isTrip } from '../../src/travel/validation';
import { TripApplicationError, type ServerTripStore } from './contracts';

function validAccountId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value.trim() === value;
}

export class TripApplicationService {
  constructor(
    private readonly store: ServerTripStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(accountId: string): Promise<Trip[]> {
    if (!validAccountId(accountId)) throw new TripApplicationError('invalid_input');
    return this.store.listOwned(accountId);
  }

  async get(accountId: string, tripId: string): Promise<Trip | null> {
    if (!validAccountId(accountId) || !isSafeTripId(tripId)) {
      throw new TripApplicationError('invalid_input');
    }
    return this.store.getOwned(accountId, tripId);
  }

  async save(accountId: string, tripId: string, candidate: unknown): Promise<Trip> {
    if (!validAccountId(accountId) || !isSafeTripId(tripId) || !isTrip(candidate) || candidate.id !== tripId) {
      throw new TripApplicationError('invalid_input');
    }
    if (candidate.ownerScopeId !== accountId) throw new TripApplicationError('access_denied');

    const existing = await this.store.getOwned(accountId, tripId);
    const updatedAt = this.now().toISOString();
    const createdAt = existing?.createdAt ?? updatedAt;
    const normalized: Trip = {
      ...candidate,
      ownerScopeId: accountId,
      createdAt,
      updatedAt,
    };
    return this.store.saveOwned(accountId, normalized);
  }
}
