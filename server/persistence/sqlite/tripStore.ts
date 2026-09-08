import type { DatabaseSync } from 'node:sqlite';
import type { Trip } from '../../../src/travel/domain';
import { isTripForOwner } from '../../../src/travel/validation';
import type { ServerTripStore } from '../../travel/contracts';

function parseTrip(value: unknown, accountId: string): Trip {
  let candidate: unknown = value;
  if (typeof value === 'string') candidate = JSON.parse(value) as unknown;
  if (!isTripForOwner(candidate, accountId)) throw new Error('Invalid persisted Trip document');
  return candidate;
}

export class SqliteTripStore implements ServerTripStore {
  constructor(private readonly database: DatabaseSync) {}

  async listOwned(accountId: string): Promise<Trip[]> {
    const rows = this.database.prepare(`
      SELECT document_json
      FROM travel_trips
      WHERE account_id = ?
      ORDER BY updated_at DESC, id ASC
    `).all(accountId) as Array<{ document_json?: unknown }>;
    return rows.map((row) => parseTrip(row.document_json, accountId));
  }

  async getOwned(accountId: string, tripId: string): Promise<Trip | null> {
    const row = this.database.prepare(`
      SELECT document_json
      FROM travel_trips
      WHERE account_id = ? AND id = ?
      LIMIT 1
    `).get(accountId, tripId) as { document_json?: unknown } | undefined;
    return row ? parseTrip(row.document_json, accountId) : null;
  }

  async saveOwned(accountId: string, trip: Trip): Promise<Trip> {
    if (trip.ownerScopeId !== accountId) throw new Error('Trip ownership mismatch');
    const createdAt = Date.parse(trip.createdAt);
    const updatedAt = Date.parse(trip.updatedAt);
    if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) throw new Error('Invalid Trip timestamps');

    this.database.prepare(`
      INSERT INTO travel_trips (account_id, id, document_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_id, id) DO UPDATE SET
        document_json = excluded.document_json,
        updated_at = excluded.updated_at
    `).run(accountId, trip.id, JSON.stringify(trip), createdAt, updatedAt);
    return trip;
  }
}
