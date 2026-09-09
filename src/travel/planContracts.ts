import type { Trip, TripPreferences } from './domain';

export const PLAN_CONTRACT_VERSION = 1 as const;

export const PLAN_CLAIM_CATEGORIES = [
  'destination',
  'timing',
  'itinerary',
  'transport_schedule',
  'price',
  'availability',
  'legal',
  'weather',
  'stay',
  'budget',
  'general',
] as const;
export type PlanClaimCategory = (typeof PLAN_CLAIM_CATEGORIES)[number];

export type PlanClaimProvenance = 'user_input' | 'provider_fact' | 'model_inference' | 'unknown';
export type PlanConfidence = 'unknown' | 'low' | 'medium' | 'high';
export type PlanSourceKind = 'official' | 'provider';
export type PlanClaimTrust = 'user_stated' | 'source_backed' | 'inference_only' | 'unknown';

export type PlanTripSnapshot = {
  tripId: string;
  revision: string;
  origin: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  travelerCount: number;
  budgetLimitRub: number;
  preferences: TripPreferences;
};

export type PlanRequest = {
  version: 1;
  trip: PlanTripSnapshot;
  userPrompt?: string;
};

export type PlanSourceReference = {
  id: string;
  kind: PlanSourceKind;
  label: string;
  providerId?: string;
  sourceUrl?: string;
  retrievedAt: string;
  validUntil?: string;
};

export type PlanClaim = {
  id: string;
  category: PlanClaimCategory;
  statement: string;
  provenance: PlanClaimProvenance;
  confidence: PlanConfidence;
  sourceIds: string[];
};

export type PlanDestinationSuggestion = {
  id: string;
  name: string;
  country?: string;
  rationaleClaimIds: string[];
};

export type PlanItinerarySuggestion = {
  id: string;
  day: number;
  title: string;
  note?: string;
  rationaleClaimIds: string[];
};

export type PlanProposal = {
  version: 1;
  tripId: string;
  summary: string;
  sources: PlanSourceReference[];
  claims: PlanClaim[];
  destinationSuggestions: PlanDestinationSuggestion[];
  itinerarySuggestions: PlanItinerarySuggestion[];
  assumptions: string[];
};

export type PlanValidationError = {
  path: string;
  code:
    | 'invalid_shape'
    | 'invalid_value'
    | 'duplicate_id'
    | 'unknown_reference'
    | 'missing_source'
    | 'official_source_required';
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CRITICAL_EXTERNAL_FACTS = new Set<PlanClaimCategory>([
  'transport_schedule',
  'price',
  'availability',
  'legal',
  'weather',
]);

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasUniqueIds<T extends { id: string }>(items: T[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function createPlanRequest(trip: Trip, userPrompt?: string): PlanRequest {
  const normalizedPrompt = userPrompt?.trim() ?? '';
  if (normalizedPrompt.length > 4_000) throw new Error('Plan prompt exceeds contract limit.');

  const preferences: TripPreferences = {
    vacationTypes: [...trip.preferences.vacationTypes],
    interests: [...trip.preferences.interests],
    transportPreferences: [...trip.preferences.transportPreferences],
    additionalNotes: trip.preferences.additionalNotes,
    flexibleDates: trip.preferences.flexibleDates,
    destinationUnknown: trip.preferences.destinationUnknown,
  };

  return {
    version: PLAN_CONTRACT_VERSION,
    trip: {
      tripId: trip.id,
      revision: trip.updatedAt,
      origin: trip.origin,
      ...(trip.destination ? { destination: trip.destination } : {}),
      ...(trip.startDate ? { startDate: trip.startDate } : {}),
      ...(trip.endDate ? { endDate: trip.endDate } : {}),
      durationDays: trip.durationDays,
      travelerCount: trip.travelers.length,
      budgetLimitRub: trip.budget.limitRub,
      preferences,
    },
    ...(normalizedPrompt ? { userPrompt: normalizedPrompt } : {}),
  };
}

export function validatePlanProposal(candidate: unknown, expectedTripId: string): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return [{ path: '$', code: 'invalid_shape' }];
  }

  const plan = candidate as Partial<PlanProposal>;
  if (plan.version !== PLAN_CONTRACT_VERSION) errors.push({ path: 'version', code: 'invalid_value' });
  if (!validId(plan.tripId) || plan.tripId !== expectedTripId) errors.push({ path: 'tripId', code: 'invalid_value' });
  if (!validText(plan.summary, 4_000)) errors.push({ path: 'summary', code: 'invalid_value' });
  if (!Array.isArray(plan.sources) || plan.sources.length > 64) errors.push({ path: 'sources', code: 'invalid_shape' });
  if (!Array.isArray(plan.claims) || plan.claims.length > 128) errors.push({ path: 'claims', code: 'invalid_shape' });
  if (!Array.isArray(plan.destinationSuggestions) || plan.destinationSuggestions.length > 16) errors.push({ path: 'destinationSuggestions', code: 'invalid_shape' });
  if (!Array.isArray(plan.itinerarySuggestions) || plan.itinerarySuggestions.length > 180) errors.push({ path: 'itinerarySuggestions', code: 'invalid_shape' });
  if (!Array.isArray(plan.assumptions) || plan.assumptions.length > 32) errors.push({ path: 'assumptions', code: 'invalid_shape' });
  if (errors.length > 0) return errors;

  const sources = plan.sources as PlanSourceReference[];
  const claims = plan.claims as PlanClaim[];
  const destinations = plan.destinationSuggestions as PlanDestinationSuggestion[];
  const itinerary = plan.itinerarySuggestions as PlanItinerarySuggestion[];
  const assumptions = plan.assumptions as string[];

  if (!hasUniqueIds(sources)) errors.push({ path: 'sources', code: 'duplicate_id' });
  if (!hasUniqueIds(claims)) errors.push({ path: 'claims', code: 'duplicate_id' });
  if (!hasUniqueIds(destinations)) errors.push({ path: 'destinationSuggestions', code: 'duplicate_id' });
  if (!hasUniqueIds(itinerary)) errors.push({ path: 'itinerarySuggestions', code: 'duplicate_id' });

  const sourceById = new Map<string, PlanSourceReference>();
  sources.forEach((source, index) => {
    if (!validId(source.id)) errors.push({ path: `sources[${index}].id`, code: 'invalid_value' });
    if (source.kind !== 'official' && source.kind !== 'provider') errors.push({ path: `sources[${index}].kind`, code: 'invalid_value' });
    if (!validText(source.label, 240)) errors.push({ path: `sources[${index}].label`, code: 'invalid_value' });
    if (!validIsoDateTime(source.retrievedAt)) errors.push({ path: `sources[${index}].retrievedAt`, code: 'invalid_value' });
    if (source.providerId !== undefined && !validId(source.providerId)) errors.push({ path: `sources[${index}].providerId`, code: 'invalid_value' });
    if (source.sourceUrl !== undefined && !validHttpsUrl(source.sourceUrl)) errors.push({ path: `sources[${index}].sourceUrl`, code: 'invalid_value' });
    if (source.validUntil !== undefined && !validIsoDateTime(source.validUntil)) errors.push({ path: `sources[${index}].validUntil`, code: 'invalid_value' });
    if (validId(source.id)) sourceById.set(source.id, source);
  });

  const claimIds = new Set<string>();
  claims.forEach((claim, index) => {
    if (!validId(claim.id)) errors.push({ path: `claims[${index}].id`, code: 'invalid_value' });
    else claimIds.add(claim.id);
    if (!(PLAN_CLAIM_CATEGORIES as readonly string[]).includes(claim.category)) errors.push({ path: `claims[${index}].category`, code: 'invalid_value' });
    if (!validText(claim.statement, 2_000)) errors.push({ path: `claims[${index}].statement`, code: 'invalid_value' });
    if (!['user_input', 'provider_fact', 'model_inference', 'unknown'].includes(claim.provenance)) errors.push({ path: `claims[${index}].provenance`, code: 'invalid_value' });
    if (!['unknown', 'low', 'medium', 'high'].includes(claim.confidence)) errors.push({ path: `claims[${index}].confidence`, code: 'invalid_value' });
    if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length > 16) {
      errors.push({ path: `claims[${index}].sourceIds`, code: 'invalid_shape' });
      return;
    }
    const resolved = claim.sourceIds.map((sourceId) => sourceById.get(sourceId)).filter(Boolean) as PlanSourceReference[];
    if (resolved.length !== claim.sourceIds.length) errors.push({ path: `claims[${index}].sourceIds`, code: 'unknown_reference' });
    if (claim.provenance === 'provider_fact' && claim.sourceIds.length === 0) {
      errors.push({ path: `claims[${index}].sourceIds`, code: 'missing_source' });
    }
    if (claim.provenance === 'provider_fact' && claim.category === 'legal') {
      const official = resolved.some((source) => source.kind === 'official' && source.sourceUrl !== undefined && validHttpsUrl(source.sourceUrl));
      if (!official) errors.push({ path: `claims[${index}].sourceIds`, code: 'official_source_required' });
    }
  });

  destinations.forEach((suggestion, index) => {
    if (!validId(suggestion.id)) errors.push({ path: `destinationSuggestions[${index}].id`, code: 'invalid_value' });
    if (!validText(suggestion.name, 160)) errors.push({ path: `destinationSuggestions[${index}].name`, code: 'invalid_value' });
    if (suggestion.country !== undefined && !validText(suggestion.country, 120)) errors.push({ path: `destinationSuggestions[${index}].country`, code: 'invalid_value' });
    if (!Array.isArray(suggestion.rationaleClaimIds) || suggestion.rationaleClaimIds.some((id) => !claimIds.has(id))) {
      errors.push({ path: `destinationSuggestions[${index}].rationaleClaimIds`, code: 'unknown_reference' });
    }
  });

  itinerary.forEach((suggestion, index) => {
    if (!validId(suggestion.id)) errors.push({ path: `itinerarySuggestions[${index}].id`, code: 'invalid_value' });
    if (!Number.isInteger(suggestion.day) || suggestion.day < 1 || suggestion.day > 180) errors.push({ path: `itinerarySuggestions[${index}].day`, code: 'invalid_value' });
    if (!validText(suggestion.title, 240)) errors.push({ path: `itinerarySuggestions[${index}].title`, code: 'invalid_value' });
    if (suggestion.note !== undefined && !validText(suggestion.note, 2_000)) errors.push({ path: `itinerarySuggestions[${index}].note`, code: 'invalid_value' });
    if (!Array.isArray(suggestion.rationaleClaimIds) || suggestion.rationaleClaimIds.some((id) => !claimIds.has(id))) {
      errors.push({ path: `itinerarySuggestions[${index}].rationaleClaimIds`, code: 'unknown_reference' });
    }
  });

  assumptions.forEach((assumption, index) => {
    if (!validText(assumption, 1_000)) errors.push({ path: `assumptions[${index}]`, code: 'invalid_value' });
  });

  return errors;
}

export function getPlanClaimTrust(claim: PlanClaim, proposal: PlanProposal): PlanClaimTrust {
  if (claim.provenance === 'user_input') return 'user_stated';
  if (claim.provenance === 'model_inference') return 'inference_only';
  if (claim.provenance !== 'provider_fact') return 'unknown';

  const sources = claim.sourceIds
    .map((id) => proposal.sources.find((source) => source.id === id))
    .filter(Boolean) as PlanSourceReference[];
  if (sources.length === 0) return 'unknown';
  if (claim.category === 'legal') {
    return sources.some((source) => source.kind === 'official' && source.sourceUrl !== undefined && validHttpsUrl(source.sourceUrl))
      ? 'source_backed'
      : 'unknown';
  }
  return 'source_backed';
}

export function canUseClaimAsAuthoritativeFact(claim: PlanClaim, proposal: PlanProposal): boolean {
  if (!CRITICAL_EXTERNAL_FACTS.has(claim.category)) return claim.provenance === 'user_input' || getPlanClaimTrust(claim, proposal) === 'source_backed';
  return getPlanClaimTrust(claim, proposal) === 'source_backed';
}
