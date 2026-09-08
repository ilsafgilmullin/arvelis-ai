import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createTripDraft } from '../src/travel/domain';
import { PostgresTripStore } from '../server/persistence/postgres/tripStore';
import { TripApplicationError } from '../server/travel/contracts';
import { TripApplicationService } from '../server/travel/service';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL Trip smoke');

const pool = new Pool({ connectionString, max: 2, application_name: 'arvelis-trip-postgres-smoke' });
const suffix = `${process.pid}-${Date.now()}`;
const accountA = `trip-a-${suffix}`;
const accountB = `trip-b-${suffix}`;
const now = Date.now();

try {
  const schema = await pool.query<{ trips: string | null }>("SELECT to_regclass('public.travel_trips')::text AS trips");
  assert.equal(schema.rows[0]?.trips, 'travel_trips');

  for (const accountId of [accountA, accountB]) {
    await pool.query(`
      INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
      VALUES ($1, $2, 'active', 1, $3, $3)
    `, [accountId, accountId, now]);
  }

  const store = new PostgresTripStore(pool);
  const service = new TripApplicationService(store, () => new Date('2026-09-09T01:00:00.000Z'));
  const trip = createTripDraft({
    origin: 'Казань',
    destination: 'Сочи',
    destinationUnknown: false,
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    flexibleDates: false,
    durationDays: 1,
    travelerCount: 2,
    budgetLimitRub: 150000,
    vacationTypes: [],
    interests: [],
    transportPreferences: [],
    additionalNotes: '',
  }, accountA);

  const saved = await service.save(accountA, trip.id, trip);
  assert.equal(saved.ownerScopeId, accountA);
  assert.equal((await service.get(accountA, trip.id))?.destination, 'Сочи');
  assert.equal(await service.get(accountB, trip.id), null);
  assert.equal((await service.list(accountA)).some((item) => item.id === trip.id), true);
  assert.equal((await service.list(accountB)).some((item) => item.id === trip.id), false);

  await assert.rejects(
    () => service.save(accountB, trip.id, trip),
    (error: unknown) => error instanceof TripApplicationError && error.code === 'access_denied',
  );

  const sameIdForB = { ...trip, ownerScopeId: accountB, origin: 'Уфа' };
  await service.save(accountB, trip.id, sameIdForB);
  assert.equal((await service.get(accountA, trip.id))?.origin, 'Казань');
  assert.equal((await service.get(accountB, trip.id))?.origin, 'Уфа');

  console.log('trip server PostgreSQL migration/ownership smoke: PASS');
} finally {
  await pool.end();
}
