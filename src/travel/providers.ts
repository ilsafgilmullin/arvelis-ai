import type { LegalCheck, MapPoint, Trip } from './domain';
import type { PlanProposal, PlanRequest } from './planContracts';
import type { TransportSearchRequest, TransportSearchResponse } from './transportContracts';

export type ProviderRequestContext = {
  accountScopeId: string;
  tripId: string;
  locale: 'ru-RU';
};

export type AIPlanProviderContext = ProviderRequestContext & {
  requestId: string;
};

export type TransportProviderRequestContext = ProviderRequestContext & {
  requestId: string;
};

export interface AIProvider {
  readonly id: string;
  planTrip(request: PlanRequest, context: AIPlanProviderContext, signal: AbortSignal): Promise<PlanProposal>;
}

export interface TransportProvider {
  readonly id: string;
  searchRoutes(
    request: TransportSearchRequest,
    context: TransportProviderRequestContext,
    signal: AbortSignal,
  ): Promise<TransportSearchResponse>;
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
