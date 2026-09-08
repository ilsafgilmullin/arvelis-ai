import assert from 'node:assert/strict';
import {
  calculateBudget,
  createTripDraft,
  getExactTripDuration,
  getTravelViewportMode,
  isTripStatus,
  TRAVEL_CAPABILITY_STATE,
  validateCreateTripInput,
  type CreateTripInput,
} from '../src/travel/domain';
import { TripRepository, type KeyValueStorage } from '../src/travel/storage';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  entries() { return [...this.values.entries()]; }
}

const input: CreateTripInput = {
  origin: 'Казань',
  destination: 'Сочи',
  destinationUnknown: false,
  startDate: '2026-09-25',
  endDate: '2026-09-30',
  flexibleDates: false,
  durationDays: 90,
  travelerCount: 2,
  budgetLimitRub: 500000,
  vacationTypes: ['Море'],
  interests: ['Прогулки'],
  transportPreferences: ['Минимум пересадок'],
  additionalNotes: 'Без сложных пересадок',
};

assert.deepEqual(validateCreateTripInput(input), []);
assert.ok(validateCreateTripInput({ ...input, origin: '' }).some((error) => error.field === 'origin'));
assert.ok(validateCreateTripInput({ ...input, endDate: '2026-09-20' }).some((error) => error.field === 'dates'));
assert.deepEqual(getExactTripDuration('2026-09-25', '2026-09-30'), { nights: 5, days: 6 });
assert.equal(getExactTripDuration('2026-09-30', '2026-09-25'), null);
assert.deepEqual(validateCreateTripInput({ ...input, flexibleDates: true, startDate: '', endDate: '', durationDays: 7 }), []);
assert.ok(validateCreateTripInput({ ...input, flexibleDates: true, startDate: '', endDate: '', durationDays: 0 }).some((error) => error.field === 'durationDays'));

const trip = createTripDraft(input, 'account-1', new Date('2026-09-08T08:00:00.000Z'));
assert.equal(trip.ownerScopeId, 'account-1');
assert.equal(trip.status, 'draft');
assert.equal(trip.durationDays, 6, 'Exact-date trip duration must be derived from calendar dates, not stale UI input');
assert.equal(trip.travelers.length, 2);
assert.equal(trip.budget.limitRub, 500000);
assert.equal(trip.budget.items.length, 0, 'Foundation must not invent automatic prices');
assert.equal(trip.itinerary.length, 0, 'Foundation must not seed fake itinerary');
assert.equal(trip.legalChecks.length, 0, 'Foundation must not seed legal conclusions');
assert.equal(trip.mapPoints.length, 0, 'Foundation must not draw fake map points');
assert.ok(isTripStatus('active'));
assert.ok(!isTripStatus('invented'));

const flexibleTrip = createTripDraft({ ...input, flexibleDates: true, startDate: '', endDate: '', durationDays: 7 }, 'account-1', new Date('2026-09-08T08:00:00.000Z'));
assert.equal(flexibleTrip.durationDays, 7, 'Flexible-date trip keeps the user-selected duration');
assert.equal(flexibleTrip.startDate, undefined);
assert.equal(flexibleTrip.endDate, undefined);

const budget = calculateBudget({ currency: 'RUB', limitRub: 120000, reserveRub: 10000, items: [
  { id: 'b1', category: 'transport', label: 'Пользовательский расход', amountRub: 25000, source: 'user' },
] });
assert.equal(budget.spentRub, 25000);
assert.equal(budget.remainingRub, 85000);
assert.equal(budget.overBudgetRub, 0);

const storage = new MemoryStorage();
const repo = new TripRepository('account-1', storage);
repo.save(trip);
assert.equal(repo.list().length, 1);
assert.equal(repo.get(trip.id)?.title, 'Казань → Сочи');
assert.equal(repo.get(trip.id)?.durationDays, 6, 'Derived duration must survive save/reopen');
assert.throws(() => new TripRepository('account-2', storage).save(trip), /ownership mismatch/i);
assert.equal(new TripRepository('account-2', storage).list().length, 0, 'Account scopes must not share trip data');

const [key, raw] = storage.entries()[0] ?? [];
assert.ok(key && raw);
const forged = JSON.parse(raw!) as { trips: Array<Record<string, unknown>> };
forged.trips.push({ ...trip, id: 'foreign-trip', ownerScopeId: 'account-2' });
storage.setItem(key!, JSON.stringify(forged));
assert.equal(repo.list().some((item) => item.id === 'foreign-trip'), false, 'Forged foreign-owned trip must be rejected');

assert.equal(TRAVEL_CAPABILITY_STATE.aiProvider, 'not_connected');
assert.equal(TRAVEL_CAPABILITY_STATE.mapProvider, 'not_connected');
assert.equal(TRAVEL_CAPABILITY_STATE.sampleContentEnabled, false);
assert.equal(getTravelViewportMode(390), 'mobile');
assert.equal(getTravelViewportMode(800), 'tablet');
assert.equal(getTravelViewportMode(1440), 'desktop');

console.log('travel foundation smoke: PASS');
