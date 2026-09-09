import {
  BUDGET_CATEGORIES,
  TRIP_STATUSES,
  type BudgetCategory,
  type Trip,
} from './domain';

const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 240;
const MAX_NOTE_LENGTH = 4_000;
const MAX_ARRAY_ITEMS = 1_000;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, max = MAX_TEXT_LENGTH, allowEmpty = false): value is string {
  return typeof value === 'string'
    && value.length <= max
    && (allowEmpty || value.trim().length > 0);
}

function optionalText(value: unknown, max = MAX_TEXT_LENGTH): boolean {
  return value === undefined || text(value, max);
}

function finiteNumber(value: unknown, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && finiteNumber(value, min, max);
}

function stringArray(value: unknown, maxItems = 50, maxText = 120): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => text(item, maxText));
}

function isoDateTime(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 40
    && Number.isFinite(Date.parse(value));
}

function optionalIsoDateTime(value: unknown): boolean {
  return value === undefined || isoDateTime(value);
}

function dateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed);
}

function optionalDateOnly(value: unknown): boolean {
  return value === undefined || dateOnly(value);
}

function source(value: unknown): value is 'user' | 'provider' {
  return value === 'user' || value === 'provider';
}

function validateTravelers(value: unknown): boolean {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 20
    && value.every((traveler) => {
      const item = record(traveler);
      return Boolean(item && text(item.id, MAX_ID_LENGTH) && text(item.label, 120));
    });
}

function validatePreferences(value: unknown): boolean {
  const item = record(value);
  return Boolean(item
    && stringArray(item.vacationTypes)
    && stringArray(item.interests)
    && stringArray(item.transportPreferences)
    && text(item.additionalNotes, MAX_NOTE_LENGTH, true)
    && typeof item.flexibleDates === 'boolean'
    && typeof item.destinationUnknown === 'boolean');
}

function validateDestinationOptions(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every((candidate) => {
    const item = record(candidate);
    return Boolean(item
      && text(item.id, MAX_ID_LENGTH)
      && text(item.name, MAX_TEXT_LENGTH)
      && optionalText(item.country, 120)
      && source(item.source));
  });
}

const TRANSPORT_MODES = new Set([
  'flight', 'train', 'bus', 'suburbanRail', 'transfer', 'ferry', 'car', 'other',
]);

function validateTransportRoutes(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every((candidate) => {
    const route = record(candidate);
    if (!route || !text(route.id, MAX_ID_LENGTH) || !Array.isArray(route.segments) || route.segments.length > 24) return false;
    if (route.totalPriceRub !== undefined && !finiteNumber(route.totalPriceRub, 0, 1_000_000_000)) return false;
    if (!optionalText(route.sourceProviderId, MAX_ID_LENGTH)) return false;
    return route.segments.every((candidateSegment) => {
      const segment = record(candidateSegment);
      return Boolean(segment
        && text(segment.id, MAX_ID_LENGTH)
        && typeof segment.mode === 'string'
        && TRANSPORT_MODES.has(segment.mode)
        && text(segment.from, MAX_TEXT_LENGTH)
        && text(segment.to, MAX_TEXT_LENGTH)
        && optionalIsoDateTime(segment.departureAt)
        && optionalIsoDateTime(segment.arrivalAt)
        && optionalText(segment.sourceProviderId, MAX_ID_LENGTH));
    });
  });
}

function validateItinerary(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 730 && value.every((candidateDay) => {
    const day = record(candidateDay);
    if (!day || !integer(day.day, 1, 730) || !optionalDateOnly(day.date) || !Array.isArray(day.items) || day.items.length > 100) return false;
    return day.items.every((candidateItem) => {
      const item = record(candidateItem);
      return Boolean(item
        && text(item.id, MAX_ID_LENGTH)
        && text(item.title, MAX_TEXT_LENGTH)
        && optionalText(item.note, MAX_NOTE_LENGTH)
        && optionalIsoDateTime(item.startsAt)
        && optionalText(item.mapPointId, MAX_ID_LENGTH)
        && (item.source === 'user' || item.source === 'provider' || item.source === 'sample'));
    });
  });
}

function budgetCategory(value: unknown): value is BudgetCategory {
  return typeof value === 'string' && (BUDGET_CATEGORIES as readonly string[]).includes(value);
}

function validateBudget(value: unknown): boolean {
  const budget = record(value);
  if (!budget
    || budget.currency !== 'RUB'
    || !finiteNumber(budget.limitRub, 0, 10_000_000_000)
    || !finiteNumber(budget.reserveRub, 0, 10_000_000_000)
    || !Array.isArray(budget.items)
    || budget.items.length > 500) return false;
  return budget.items.every((candidate) => {
    const item = record(candidate);
    return Boolean(item
      && text(item.id, MAX_ID_LENGTH)
      && budgetCategory(item.category)
      && text(item.label, MAX_TEXT_LENGTH)
      && finiteNumber(item.amountRub, 0, 10_000_000_000)
      && source(item.source));
  });
}

const LEGAL_CONFIDENCE = new Set(['unknown', 'low', 'medium', 'high']);
const LEGAL_REQUIREMENT_STATUS = new Set(['unknown', 'unverified', 'verified', 'expired']);
const LEGAL_CHECK_STATUS = new Set(['not_started', 'in_progress', 'ready', 'needs_review']);

function validateLegal(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 100 && value.every((candidateCheck) => {
    const check = record(candidateCheck);
    if (!check
      || !text(check.id, MAX_ID_LENGTH)
      || !text(check.country, 120)
      || typeof check.status !== 'string'
      || !LEGAL_CHECK_STATUS.has(check.status)
      || !Array.isArray(check.requirements)
      || check.requirements.length > 200
      || !Array.isArray(check.sources)
      || check.sources.length > 100) return false;

    const requirementsValid = check.requirements.every((candidate) => {
      const item = record(candidate);
      return Boolean(item
        && text(item.id, MAX_ID_LENGTH)
        && text(item.country, 120)
        && text(item.requirementType, 160)
        && text(item.summary, MAX_NOTE_LENGTH)
        && text(item.sourceName, MAX_TEXT_LENGTH)
        && text(item.sourceUrl, 2_048)
        && optionalIsoDateTime(item.verifiedAt)
        && optionalIsoDateTime(item.effectiveFrom)
        && optionalIsoDateTime(item.effectiveUntil)
        && typeof item.confidence === 'string'
        && LEGAL_CONFIDENCE.has(item.confidence)
        && typeof item.status === 'string'
        && LEGAL_REQUIREMENT_STATUS.has(item.status));
    });

    const sourcesValid = check.sources.every((candidate) => {
      const item = record(candidate);
      return Boolean(item
        && text(item.id, MAX_ID_LENGTH)
        && text(item.sourceName, MAX_TEXT_LENGTH)
        && text(item.sourceUrl, 2_048)
        && optionalIsoDateTime(item.verifiedAt));
    });
    return requirementsValid && sourcesValid;
  });
}

function validateMapPoints(value: unknown): boolean {
  return Array.isArray(value) && value.length <= MAX_ARRAY_ITEMS && value.every((candidate) => {
    const item = record(candidate);
    return Boolean(item
      && text(item.id, MAX_ID_LENGTH)
      && text(item.label, MAX_TEXT_LENGTH)
      && (item.latitude === undefined || finiteNumber(item.latitude, -90, 90))
      && (item.longitude === undefined || finiteNumber(item.longitude, -180, 180))
      && source(item.source));
  });
}

const TRIP_BOOK_KEYS = new Set([
  'cover', 'overview', 'documents', 'transport', 'stay', 'itinerary', 'map', 'budget', 'legal', 'usefulInfo', 'emergencyContacts',
]);
const TRIP_BOOK_STATUSES = new Set(['empty', 'draft', 'ready']);

function validateTripBook(value: unknown): boolean {
  const book = record(value);
  return Boolean(book
    && text(book.id, MAX_ID_LENGTH)
    && Array.isArray(book.sections)
    && book.sections.length <= 20
    && book.sections.every((candidate) => {
      const section = record(candidate);
      return Boolean(section
        && typeof section.key === 'string'
        && TRIP_BOOK_KEYS.has(section.key)
        && typeof section.status === 'string'
        && TRIP_BOOK_STATUSES.has(section.status));
    }));
}

export function isTrip(value: unknown): value is Trip {
  const trip = record(value);
  if (!trip) return false;
  return Boolean(
    text(trip.id, MAX_ID_LENGTH)
    && text(trip.ownerScopeId, MAX_ID_LENGTH)
    && text(trip.title, MAX_TEXT_LENGTH)
    && text(trip.origin, MAX_TEXT_LENGTH)
    && optionalText(trip.destination, MAX_TEXT_LENGTH)
    && optionalDateOnly(trip.startDate)
    && optionalDateOnly(trip.endDate)
    && integer(trip.durationDays, 1, 730)
    && validateTravelers(trip.travelers)
    && typeof trip.status === 'string'
    && (TRIP_STATUSES as readonly string[]).includes(trip.status)
    && validatePreferences(trip.preferences)
    && validateDestinationOptions(trip.destinationOptions)
    && validateTransportRoutes(trip.transportRoutes)
    && validateItinerary(trip.itinerary)
    && validateBudget(trip.budget)
    && validateLegal(trip.legalChecks)
    && validateMapPoints(trip.mapPoints)
    && validateTripBook(trip.tripBook)
    && isoDateTime(trip.createdAt)
    && isoDateTime(trip.updatedAt)
  );
}

export function isTripForOwner(value: unknown, ownerScopeId: string): value is Trip {
  return isTrip(value) && value.ownerScopeId === ownerScopeId;
}

export function isSafeTripId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
