import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTripDraft, type Trip } from '../src/travel/domain';
import { ensureSqliteAuthSchema } from '../server/persistence/sqlite/database';
import { SqliteTripStore } from '../server/persistence/sqlite/tripStore';
import { TripApplicationError } from '../server/travel/contracts';
import { TripApplicationService } from '../server/travel/service';

function draft(ownerScopeId: string, origin: string, destination: string): Trip {
  return createTripDraft({
    origin,
    destination,
    destinationUnknown: false,
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    flexibleDates: false,
    durationDays: 1,
    travelerCount: 2,
    budgetLimitRub: 150000,
    vacationTypes: ['Город'],
    interests: ['Еда'],
    transportPreferences: ['Поезд'],
    additionalNotes: 'Без сложных пересадок',
  }, ownerScopeId, new Date('2020-01-01T00:00:00.000Z'));
}

async function main(): Promise<void> {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  ensureSqliteAuthSchema(database);

  const migrations = database.prepare('SELECT id FROM auth_schema_migrations ORDER BY id').all() as Array<{ id: string }>;
  assert.deepEqual(migrations.map((row) => row.id), ['001_auth_foundation', '002_travel_trip_persistence']);

  const now = 1_800_000_000_000;
  for (const accountId of ['account-a', 'account-b']) {
    database.prepare(`
      INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
      VALUES (?, ?, 'active', 1, ?, ?)
    `).run(accountId, accountId, now, now);
  }

  const store = new SqliteTripStore(database);
  let clock = new Date('2026-09-09T00:00:00.000Z');
  const service = new TripApplicationService(store, () => clock);

  const clientTrip = draft('account-a', 'Казань', 'Сочи');
  const created = await service.save('account-a', clientTrip.id, clientTrip);
  assert.equal(created.ownerScopeId, 'account-a');
  assert.equal(created.createdAt, '2026-09-09T00:00:00.000Z');
  assert.equal(created.updatedAt, '2026-09-09T00:00:00.000Z');
  assert.equal(created.durationDays, 8);

  clock = new Date('2026-09-09T00:05:00.000Z');
  const updated = await service.save('account-a', created.id, { ...created, title: 'Обновлённая поездка' });
  assert.equal(updated.createdAt, created.createdAt, 'createdAt must remain server-authoritative and stable');
  assert.equal(updated.updatedAt, '2026-09-09T00:05:00.000Z');
  assert.equal((await service.get('account-a', created.id))?.title, 'Обновлённая поездка');

  const privateTrip = draft('account-a', 'Казань', 'Москва');
  await service.save('account-a', privateTrip.id, privateTrip);
  assert.equal(await service.get('account-b', privateTrip.id), null, 'another account must not read an owned Trip');

  const sameIdForB = { ...draft('account-b', 'Уфа', 'Самара'), id: created.id };
  await service.save('account-b', created.id, sameIdForB);
  assert.equal((await service.get('account-a', created.id))?.ownerScopeId, 'account-a');
  assert.equal((await service.get('account-b', created.id))?.ownerScopeId, 'account-b');
  assert.equal((await service.list('account-a')).every((trip) => trip.ownerScopeId === 'account-a'), true);
  assert.equal((await service.list('account-b')).every((trip) => trip.ownerScopeId === 'account-b'), true);

  await assert.rejects(
    () => service.save('account-a', created.id, { ...created, ownerScopeId: 'account-b' }),
    (error: unknown) => error instanceof TripApplicationError && error.code === 'access_denied',
  );
  await assert.rejects(
    () => service.save('account-a', created.id, { id: created.id }),
    (error: unknown) => error instanceof TripApplicationError && error.code === 'invalid_input',
  );
  await assert.rejects(
    () => service.save('account-a', 'different-id', created),
    (error: unknown) => error instanceof TripApplicationError && error.code === 'invalid_input',
  );

  database.close();
  console.log('trip server SQLite persistence/ownership smoke: PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
