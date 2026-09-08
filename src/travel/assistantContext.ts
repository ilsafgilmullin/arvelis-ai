import type { ItineraryDay, LegalCheck, MapPoint, Trip, TripPreferences } from './domain';

export type TravelAssistantUiStatus =
  | 'empty'
  | 'user_message'
  | 'loading'
  | 'error'
  | 'offline'
  | 'provider_unavailable'
  | 'not_connected';

export type GeneralTravelAssistantContext = {
  scope: 'general';
  source: 'home' | 'assistant' | 'service';
};

export type TripAssistantSnapshot = {
  tripId: string;
  origin: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  durationDays: number;
  travelerCount: number;
  budgetLimitRub: number;
  preferences: TripPreferences;
  itinerary: ItineraryDay[];
  legalChecks: LegalCheck[];
  mapPoints: MapPoint[];
};

export type TripTravelAssistantContext = {
  scope: 'trip';
  source: 'trip';
  tripId: string;
  trip: TripAssistantSnapshot;
};

export type TravelAssistantContext = GeneralTravelAssistantContext | TripTravelAssistantContext;

export function createGeneralAssistantContext(
  source: GeneralTravelAssistantContext['source'] = 'assistant',
): GeneralTravelAssistantContext {
  return { scope: 'general', source };
}

export function createTripAssistantContext(trip: Trip): TripTravelAssistantContext {
  return {
    scope: 'trip',
    source: 'trip',
    tripId: trip.id,
    trip: {
      tripId: trip.id,
      origin: trip.origin,
      ...(trip.destination ? { destination: trip.destination } : {}),
      ...(trip.startDate ? { startDate: trip.startDate } : {}),
      ...(trip.endDate ? { endDate: trip.endDate } : {}),
      durationDays: trip.durationDays,
      travelerCount: trip.travelers.length,
      budgetLimitRub: trip.budget.limitRub,
      preferences: trip.preferences,
      itinerary: trip.itinerary,
      legalChecks: trip.legalChecks,
      mapPoints: trip.mapPoints,
    },
  };
}
