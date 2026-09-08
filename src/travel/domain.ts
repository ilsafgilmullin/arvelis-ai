export const TRIP_STATUSES = ['draft', 'planning', 'ready', 'active', 'completed', 'archived'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const BUDGET_CATEGORIES = [
  'transport',
  'stay',
  'food',
  'localTransport',
  'activities',
  'insurance',
  'visaAndFees',
  'other',
  'reserve',
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export type Traveler = {
  id: string;
  label: string;
};

export type TripPreferences = {
  vacationTypes: string[];
  interests: string[];
  transportPreferences: string[];
  additionalNotes: string;
  flexibleDates: boolean;
  destinationUnknown: boolean;
};

export type DestinationOption = {
  id: string;
  name: string;
  country?: string;
  source: 'user' | 'provider';
};

export type TransportSegment = {
  id: string;
  mode: 'flight' | 'train' | 'bus' | 'suburbanRail' | 'transfer' | 'ferry' | 'car' | 'other';
  from: string;
  to: string;
  departureAt?: string;
  arrivalAt?: string;
  sourceProviderId?: string;
};

export type TransportRoute = {
  id: string;
  segments: TransportSegment[];
  totalPriceRub?: number;
  sourceProviderId?: string;
};

export type ItineraryItem = {
  id: string;
  title: string;
  note?: string;
  startsAt?: string;
  mapPointId?: string;
  source: 'user' | 'provider' | 'sample';
};

export type ItineraryDay = {
  day: number;
  date?: string;
  items: ItineraryItem[];
};

export type BudgetItem = {
  id: string;
  category: BudgetCategory;
  label: string;
  amountRub: number;
  source: 'user' | 'provider';
};

export type Budget = {
  currency: 'RUB';
  limitRub: number;
  reserveRub: number;
  items: BudgetItem[];
};

export type LegalSource = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt?: string;
};

export type LegalRequirement = {
  id: string;
  country: string;
  requirementType: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  confidence: 'unknown' | 'low' | 'medium' | 'high';
  status: 'unknown' | 'unverified' | 'verified' | 'expired';
};

export type LegalCheck = {
  id: string;
  country: string;
  status: 'not_started' | 'in_progress' | 'ready' | 'needs_review';
  requirements: LegalRequirement[];
  sources: LegalSource[];
};

export type MapPoint = {
  id: string;
  label: string;
  latitude?: number;
  longitude?: number;
  source: 'user' | 'provider';
};

export type TripBookSectionKey =
  | 'cover'
  | 'overview'
  | 'documents'
  | 'transport'
  | 'stay'
  | 'itinerary'
  | 'map'
  | 'budget'
  | 'legal'
  | 'usefulInfo'
  | 'emergencyContacts';

export type TripBook = {
  id: string;
  sections: Array<{ key: TripBookSectionKey; status: 'empty' | 'draft' | 'ready' }>;
};

export type Trip = {
  id: string;
  ownerScopeId: string;
  title: string;
  origin: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  travelers: Traveler[];
  status: TripStatus;
  preferences: TripPreferences;
  destinationOptions: DestinationOption[];
  transportRoutes: TransportRoute[];
  itinerary: ItineraryDay[];
  budget: Budget;
  legalChecks: LegalCheck[];
  mapPoints: MapPoint[];
  tripBook: TripBook;
  createdAt: string;
  updatedAt: string;
};

export type CreateTripInput = {
  origin: string;
  destination: string;
  destinationUnknown: boolean;
  startDate: string;
  endDate: string;
  flexibleDates: boolean;
  durationDays: number;
  travelerCount: number;
  budgetLimitRub: number;
  vacationTypes: string[];
  interests: string[];
  transportPreferences: string[];
  additionalNotes: string;
};

export type TripValidationError = {
  field: keyof CreateTripInput | 'dates';
  message: string;
};

export const TRAVEL_CAPABILITY_STATE = {
  aiProvider: 'not_connected',
  transportProviders: 'not_connected',
  mapProvider: 'not_connected',
  legalProvider: 'not_connected',
  weatherProvider: 'not_connected',
  stayProvider: 'not_connected',
  currencyProvider: 'not_connected',
  sampleContentEnabled: false,
} as const;

const makeId = (prefix: string): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
};

export function isTripStatus(value: unknown): value is TripStatus {
  return typeof value === 'string' && (TRIP_STATUSES as readonly string[]).includes(value);
}

export function validateCreateTripInput(input: CreateTripInput): TripValidationError[] {
  const errors: TripValidationError[] = [];
  if (!input.origin.trim()) errors.push({ field: 'origin', message: 'Укажите город отправления.' });
  if (!input.destinationUnknown && !input.destination.trim()) {
    errors.push({ field: 'destination', message: 'Укажите направление или выберите «Не знаю куда».' });
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1 || input.durationDays > 90) {
    errors.push({ field: 'durationDays', message: 'Количество дней должно быть от 1 до 90.' });
  }
  if (!Number.isInteger(input.travelerCount) || input.travelerCount < 1 || input.travelerCount > 20) {
    errors.push({ field: 'travelerCount', message: 'Количество путешественников должно быть от 1 до 20.' });
  }
  if (!Number.isFinite(input.budgetLimitRub) || input.budgetLimitRub <= 0) {
    errors.push({ field: 'budgetLimitRub', message: 'Укажите бюджет больше нуля.' });
  }
  if (!input.flexibleDates) {
    if (!input.startDate || !input.endDate) {
      errors.push({ field: 'dates', message: 'Укажите даты или включите гибкие даты.' });
    } else if (input.endDate < input.startDate) {
      errors.push({ field: 'dates', message: 'Дата окончания не может быть раньше даты начала.' });
    }
  }
  return errors;
}

export function calculateBudget(budget: Budget) {
  const spentRub = budget.items.reduce((sum, item) => sum + Math.max(0, item.amountRub), 0);
  const reserveRub = Math.max(0, budget.reserveRub);
  return {
    limitRub: Math.max(0, budget.limitRub),
    spentRub,
    reserveRub,
    remainingRub: Math.max(0, budget.limitRub - spentRub - reserveRub),
    overBudgetRub: Math.max(0, spentRub + reserveRub - budget.limitRub),
  };
}

export function createTripDraft(input: CreateTripInput, ownerScopeId: string, now = new Date()): Trip {
  const errors = validateCreateTripInput(input);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(' '));
  }
  if (!ownerScopeId.trim()) throw new Error('Trip owner scope is required.');

  const timestamp = now.toISOString();
  const destination = input.destinationUnknown ? undefined : input.destination.trim();
  const title = destination ? `${input.origin.trim()} → ${destination}` : `Подбор направления из ${input.origin.trim()}`;
  const travelers = Array.from({ length: input.travelerCount }, (_, index) => ({
    id: makeId('traveler'),
    label: input.travelerCount === 1 ? 'Путешественник' : `Путешественник ${index + 1}`,
  }));

  return {
    id: makeId('trip'),
    ownerScopeId,
    title,
    origin: input.origin.trim(),
    ...(destination ? { destination } : {}),
    ...(!input.flexibleDates && input.startDate ? { startDate: input.startDate } : {}),
    ...(!input.flexibleDates && input.endDate ? { endDate: input.endDate } : {}),
    durationDays: input.durationDays,
    travelers,
    status: 'draft',
    preferences: {
      vacationTypes: input.vacationTypes,
      interests: input.interests,
      transportPreferences: input.transportPreferences,
      additionalNotes: input.additionalNotes.trim(),
      flexibleDates: input.flexibleDates,
      destinationUnknown: input.destinationUnknown,
    },
    destinationOptions: [],
    transportRoutes: [],
    itinerary: [],
    budget: {
      currency: 'RUB',
      limitRub: input.budgetLimitRub,
      reserveRub: 0,
      items: [],
    },
    legalChecks: [],
    mapPoints: [],
    tripBook: {
      id: makeId('tripbook'),
      sections: [
        'cover', 'overview', 'documents', 'transport', 'stay', 'itinerary', 'map', 'budget', 'legal', 'usefulInfo', 'emergencyContacts',
      ].map((key) => ({ key: key as TripBookSectionKey, status: 'empty' as const })),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getTravelViewportMode(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}
