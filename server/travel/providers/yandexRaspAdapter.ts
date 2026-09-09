import type {
  NormalizedTransportMode,
  NormalizedTransportRoute,
  TransportMoney,
  TransportSearchLeg,
  TransportSearchRequest,
  TransportSearchResponse,
} from '../../../src/travel/transportContracts';
import type { TransportProvider, TransportProviderRequestContext } from '../../../src/travel/providers';
import { YANDEX_RASP_V3_DESCRIPTOR } from '../transportProviderPolicy';

export type YandexRaspResolvedPoint = {
  code: string;
  label: string;
};

export interface YandexRaspLocationResolver {
  resolvePoint(label: string, signal: AbortSignal): Promise<YandexRaspResolvedPoint | null>;
}

export type YandexRaspSearchRequest = {
  fromCode: string;
  toCode: string;
  date: string;
};

export type YandexRaspPrice = {
  whole: number;
  cents: number;
};

export type YandexRaspTicketPlace = {
  currency: string;
  price: YandexRaspPrice;
  name?: string | null;
};

export type YandexRaspTicketsInfo = {
  et_marker?: boolean;
  places?: YandexRaspTicketPlace[];
};

export type YandexRaspStation = {
  code?: string;
  title: string;
};

export type YandexRaspCarrier = {
  title?: string;
};

export type YandexRaspThread = {
  uid?: string;
  number?: string;
  transport_type?: string;
  carrier?: YandexRaspCarrier;
};

export type YandexRaspSegment = {
  departure: string;
  arrival: string;
  from: YandexRaspStation;
  to: YandexRaspStation;
  thread?: YandexRaspThread;
  has_transfers?: boolean;
  tickets_info?: YandexRaspTicketsInfo;
};

export type YandexRaspSearchResponse = {
  segments?: YandexRaspSegment[];
};

export interface YandexRaspClient {
  searchPointToPoint(request: YandexRaspSearchRequest, signal: AbortSignal): Promise<YandexRaspSearchResponse>;
}

export type YandexRaspTransportAdapterOptions = {
  client: YandexRaspClient;
  locationResolver: YandexRaspLocationResolver;
  now?: () => Date;
};

const PROVIDER_ID = YANDEX_RASP_V3_DESCRIPTOR.id;
const SOURCE_URL = 'https://rasp.yandex.ru/';
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function mapTransportMode(value: string | undefined): NormalizedTransportMode {
  switch (value) {
    case 'plane': return 'flight';
    case 'train': return 'train';
    case 'suburban': return 'suburbanRail';
    case 'bus': return 'bus';
    case 'water': return 'ferry';
    default: return 'other';
  }
}

function cleanOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toMinorUnits(price: YandexRaspPrice): number | null {
  if (!Number.isSafeInteger(price.whole) || price.whole < 0) return null;
  if (!Number.isSafeInteger(price.cents) || price.cents < 0 || price.cents > 99) return null;
  const result = price.whole * 100 + price.cents;
  return Number.isSafeInteger(result) ? result : null;
}

function extractFromPrice(segment: YandexRaspSegment): TransportMoney | undefined {
  const places = segment.tickets_info?.places ?? [];
  const normalized = places
    .map((place) => ({
      amountMinor: toMinorUnits(place.price),
      currency: place.currency.toUpperCase(),
    }))
    .filter((item): item is { amountMinor: number; currency: string } => item.amountMinor !== null && CURRENCY_PATTERN.test(item.currency));

  if (normalized.length === 0) return undefined;
  const currencies = new Set(normalized.map((item) => item.currency));
  if (currencies.size !== 1) return undefined;
  const currency = normalized[0]?.currency;
  if (currency === undefined) return undefined;
  return {
    amountMinor: Math.min(...normalized.map((item) => item.amountMinor)),
    currency,
    semantics: 'from',
  };
}

function mapSegment(leg: TransportSearchLeg, segment: YandexRaspSegment, index: number): NormalizedTransportRoute | null {
  if (segment.has_transfers === true) return null;
  if (!segment.departure || !segment.arrival || !segment.from?.title || !segment.to?.title) return null;

  const providerRouteId = cleanOptionalText(segment.thread?.uid) ?? `${leg.id}-${index}`;
  const carrierName = cleanOptionalText(segment.thread?.carrier?.title);
  const serviceNumber = cleanOptionalText(segment.thread?.number);
  const fromCode = cleanOptionalText(segment.from.code);
  const toCode = cleanOptionalText(segment.to.code);
  const price = extractFromPrice(segment);

  return {
    id: `yr:${leg.id}:${index}`,
    legId: leg.id,
    providerRouteId,
    segments: [{
      id: `yrseg:${leg.id}:${index}`,
      mode: mapTransportMode(segment.thread?.transport_type),
      from: {
        label: segment.from.title.trim(),
        ...(fromCode ? { code: fromCode } : {}),
      },
      to: {
        label: segment.to.title.trim(),
        ...(toCode ? { code: toCode } : {}),
      },
      departureAt: segment.departure,
      arrivalAt: segment.arrival,
      ...(carrierName ? { carrierName } : {}),
      ...(serviceNumber ? { serviceNumber } : {}),
    }],
    ...(price ? { price } : {}),
    availability: 'unknown',
    sourceUrl: SOURCE_URL,
  };
}

export class YandexRaspTransportAdapter implements TransportProvider {
  readonly id = PROVIDER_ID;
  private readonly client: YandexRaspClient;
  private readonly locationResolver: YandexRaspLocationResolver;
  private readonly now: () => Date;

  constructor(options: YandexRaspTransportAdapterOptions) {
    this.client = options.client;
    this.locationResolver = options.locationResolver;
    this.now = options.now ?? (() => new Date());
  }

  async searchRoutes(
    request: TransportSearchRequest,
    context: TransportProviderRequestContext,
    signal: AbortSignal,
  ): Promise<TransportSearchResponse> {
    const pointCache = new Map<string, YandexRaspResolvedPoint>();
    const resolve = async (label: string): Promise<YandexRaspResolvedPoint> => {
      const cached = pointCache.get(label);
      if (cached) return cached;
      const point = await this.locationResolver.resolvePoint(label, signal);
      if (point === null || !point.code.trim()) {
        throw new Error(`Yandex Rasp location code is unavailable for: ${label}`);
      }
      pointCache.set(label, point);
      return point;
    };

    const routes: NormalizedTransportRoute[] = [];
    for (const leg of request.legs) {
      if (signal.aborted) throw signal.reason ?? new Error('Transport request aborted');
      const [from, to] = await Promise.all([resolve(leg.fromLabel), resolve(leg.toLabel)]);
      const raw = await this.client.searchPointToPoint({
        fromCode: from.code,
        toCode: to.code,
        date: leg.date,
      }, signal);
      for (const [index, segment] of (raw.segments ?? []).entries()) {
        const mapped = mapSegment(leg, segment, index);
        if (mapped !== null) routes.push(mapped);
      }
    }

    return {
      version: 1,
      providerId: this.id,
      requestId: context.requestId,
      retrievedAt: this.now().toISOString(),
      routes,
    };
  }
}
