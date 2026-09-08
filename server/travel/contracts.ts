import type { Trip } from '../../src/travel/domain';

export interface ServerTripStore {
  listOwned(accountId: string): Promise<Trip[]>;
  getOwned(accountId: string, tripId: string): Promise<Trip | null>;
  saveOwned(accountId: string, trip: Trip): Promise<Trip>;
}

export type TripApplicationErrorCode = 'invalid_input' | 'access_denied';

export class TripApplicationError extends Error {
  constructor(readonly code: TripApplicationErrorCode) {
    super(code);
    this.name = 'TripApplicationError';
  }
}
