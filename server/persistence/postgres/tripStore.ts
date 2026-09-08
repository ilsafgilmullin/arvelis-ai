import type { Pool } from 'pg';
import type { Trip } from '../../../src/travel/domain';
import { isTripForOwner } from '../../../src/travel/validation';
import type { ServerTripStore } from '../../travel/contracts';

type TripRow = { document_json: unknown };

function parseTrip(value: unknown, accountId: string): Trip {
  let candidate = value;
  if (typeof value === 'string') candidate = JSON.parse(value) as unknown;
  if (!isTripForOwner(candidate, accountId)) throw new Error('Invalid persisted Trip document');
  return candidate;
}

export class PostgresTripStore implements ServerTripStore {
  constructor(private readonly pool: Pool) {}

  async listOwned(accountId: string): Promise<Trip[]> {
    const result = await this.pool.query<TripRow>(`
      SELECT document_json
      FROM travel_trips
      WHERE account_id = $1
      ORDER BY updated_at DESC, id ASC
    `, [accountId]);
    return result.rows.map((row) => parseTrip(row.document_json, accountId));
  }

  async getOwned(accountId: string, tripId: string): Promise<Trip | null> {
    const result = await this.pool.query<TripRow>(`
      SELECT document_json
      FROM travel_trips
      WHERE account_id = $1 AND id = $2
      LIMIT 1
    `, [accountId, tripId]);
    const row = result.rows[0];
    return row ? parseTrip(row.document_json, accountId) : null;
  }

  async saveOwned(accountId: string, trip: Trip): Promise<Trip> {
    if (trip.ownerScopeId !== accountId) throw new Error('Trip ownership mismatch');
    const createdAt = Date.parse(trip.createdAt);
    const updatedAt = Date.parse(trip.updatedAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) throw new Error('Invalid Trip timestamps');

    await this.pool.query(`
      INSERT INTO travel_trips (account_id, id, document_json, created_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT(account_id, id) DO UPDATE SET
        document_json = EXCLUDED.document_json,
        updated_at = EXCLUDED.updated_at
    `, [accountId, trip.id, JSON.stringify(trip), createdAt, updatedAt]);
    return trip;
  }
}
