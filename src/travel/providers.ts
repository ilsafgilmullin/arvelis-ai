import type { Trip } from './domain';
import type { LegalCheckRequest, LegalCheckResponse } from './legalContracts';
import type { MapRouteRequest, MapRouteResponse } from './mapContracts';
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

export type MapProviderRequestContext = ProviderRequestContext & {
  requestId: string;
};

export type LegalProviderRequestContext = ProviderRequestContext & {
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
  resolveRouteMap(
    request: MapRouteRequest,
    context: MapProviderRequestContext,
    signal: AbortSignal,
  ): Promise<MapRouteResponse>;
}

export interface LegalSourceProvider {
  readonly id: string;
  checkRouteRequirements(
    request: LegalCheckRequest,
    context: LegalProviderRequestContext,
    signal: AbortSignal,
  ): Promise<LegalCheckResponse>;
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
