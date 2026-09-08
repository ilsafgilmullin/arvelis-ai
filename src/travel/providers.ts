import type { LegalCheck, MapPoint, TransportRoute, Trip } from './domain';

export type ProviderRequestContext = {
  accountScopeId: string;
  tripId: string;
  locale: 'ru-RU';
};

export interface AIProvider {
  readonly id: string;
  planTrip(trip: Trip, context: ProviderRequestContext): Promise<unknown>;
}

export interface TransportProvider {
  readonly id: string;
  searchRoutes(trip: Trip, context: ProviderRequestContext): Promise<TransportRoute[]>;
}

export interface MapProvider {
  readonly id: string;
  resolvePoints(trip: Trip, context: ProviderRequestContext): Promise<MapPoint[]>;
}

export interface LegalSourceProvider {
  readonly id: string;
  checkTrip(trip: Trip, context: ProviderRequestContext): Promise<LegalCheck[]>;
}

export interface WeatherProvider {
  readonly id: string;
  getTripWeather(trip: Trip, context: ProviderRequestContext): Promise<unknown>;
}

export interface StayProvider {
  readonly id: string;
  searchStays(trip: Trip, context: ProviderRequestContext): Promise<unknown[]>;
}

export interface CurrencyProvider {
  readonly id: string;
  convert(amount: number, from: string, to: string, context: ProviderRequestContext): Promise<number>;
}
