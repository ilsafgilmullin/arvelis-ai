import type { TransportProvider, TransportProviderRequestContext } from '../../../src/travel/providers';
import type { TransportSearchRequest, TransportSearchResponse } from '../../../src/travel/transportContracts';
import { YandexRaspTransportAdapter, type YandexRaspLocationResolver, type YandexRaspResolvedPoint } from './yandexRaspAdapter';
import { YandexRaspHttpClient, type YandexRaspStationsListResponse } from './yandexRaspHttpClient';
import { evaluateTransportProviderActivation, YANDEX_RASP_V3_DESCRIPTOR, type TransportProviderActivationBlocker } from '../transportProviderPolicy';

export const YANDEX_RASP_SEARCH_CACHE_TTL_MS = 60_000;
export const YANDEX_RASP_LOCATION_CACHE_TTL_MS = 15 * 60_000;
export const YANDEX_RASP_MAX_SEARCH_CACHE_ENTRIES = 64;

export type YandexRaspLiveEnvironment = Readonly<Record<string, string | undefined>>;

export type YandexRaspLiveAttribution = {
  text: string;
  url: string;
  placement: 'adjacent_to_data';
};

export type YandexRaspLiveProviderState = {
  status: 'ready' | 'disabled';
  provider: TransportProvider | null;
  blockers: TransportProviderActivationBlocker[];
  attribution: YandexRaspLiveAttribution;
  cachePolicy: {
    persistence: 'temporary_memory_only';
    searchTtlMs: number;
    locationDirectoryTtlMs: number;
  };
};

export type YandexRaspLiveProviderOptions = {
  env?: YandexRaspLiveEnvironment;
  now?: () => Date;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  allowInsecureTestEndpoint?: boolean;
  searchCacheTtlMs?: number;
  locationDirectoryTtlMs?: number;
};

type CachedDirectory = {
  expiresAt: number;
  value: YandexRaspStationsListResponse;
};

type CachedPoint = {
  expiresAt: number;
  value: YandexRaspResolvedPoint | null;
};

type SearchCacheEntry = {
  expiresAt: number;
  response: TransportSearchResponse;
};

function normalizeLocationLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractYandexCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.codes)) return null;
  const code = value.codes.yandex_code;
  return typeof code === 'string' && code.trim().length > 0 && code.length <= 32 ? code.trim() : null;
}

function extractTitle(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const title = value.title;
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : null;
}

export class YandexRaspStationsLocationResolver implements YandexRaspLocationResolver {
  private readonly client: YandexRaspHttpClient;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private directory: CachedDirectory | null = null;
  private directoryPromise: Promise<YandexRaspStationsListResponse> | null = null;
  private readonly pointCache = new Map<string, CachedPoint>();

  constructor(client: YandexRaspHttpClient, options: { now?: () => Date; ttlMs?: number } = {}) {
    this.client = client;
    this.now = options.now ?? (() => new Date());
    const ttlMs = options.ttlMs ?? YANDEX_RASP_LOCATION_CACHE_TTL_MS;
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 30 * 60_000) {
      throw new Error('Yandex Rasp location cache TTL is outside the allowed temporary range.');
    }
    this.ttlMs = ttlMs;
  }

  private async getDirectory(signal: AbortSignal): Promise<YandexRaspStationsListResponse> {
    const nowMs = this.now().getTime();
    if (this.directory !== null && this.directory.expiresAt > nowMs) return this.directory.value;
    if (this.directoryPromise !== null) return this.directoryPromise;

    const load = this.client.getStationsList(signal).then((value) => {
      this.directory = { value, expiresAt: this.now().getTime() + this.ttlMs };
      return value;
    });
    this.directoryPromise = load;
    try {
      return await load;
    } finally {
      if (this.directoryPromise === load) this.directoryPromise = null;
    }
  }

  async resolvePoint(label: string, signal: AbortSignal): Promise<YandexRaspResolvedPoint | null> {
    const normalized = normalizeLocationLabel(label);
    if (normalized.length === 0) return null;
    const nowMs = this.now().getTime();
    const cached = this.pointCache.get(normalized);
    if (cached !== undefined && cached.expiresAt > nowMs) return cached.value;

    const directory = await this.getDirectory(signal);
    const settlementMatches: YandexRaspResolvedPoint[] = [];
    const stationMatches: YandexRaspResolvedPoint[] = [];

    for (const country of directory.countries) {
      if (!isRecord(country) || !Array.isArray(country.regions)) continue;
      for (const region of country.regions) {
        if (!isRecord(region) || !Array.isArray(region.settlements)) continue;
        for (const settlement of region.settlements) {
          if (!isRecord(settlement)) continue;
          const settlementTitle = extractTitle(settlement);
          const settlementCode = extractYandexCode(settlement);
          if (settlementTitle !== null && settlementCode !== null && normalizeLocationLabel(settlementTitle) === normalized) {
            settlementMatches.push({ code: settlementCode, label: settlementTitle });
          }
          if (!Array.isArray(settlement.stations)) continue;
          for (const station of settlement.stations) {
            const stationTitle = extractTitle(station);
            const stationCode = extractYandexCode(station);
            if (stationTitle !== null && stationCode !== null && normalizeLocationLabel(stationTitle) === normalized) {
              stationMatches.push({ code: stationCode, label: stationTitle });
            }
          }
        }
      }
    }

    const uniqueByCode = (items: YandexRaspResolvedPoint[]): YandexRaspResolvedPoint[] => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.code)) return false;
        seen.add(item.code);
        return true;
      });
    };

    const settlements = uniqueByCode(settlementMatches);
    const stations = uniqueByCode(stationMatches);
    const resolved = settlements.length === 1
      ? settlements[0] ?? null
      : settlements.length > 1
        ? null
        : stations.length === 1
          ? stations[0] ?? null
          : null;
    this.pointCache.set(normalized, { value: resolved, expiresAt: nowMs + this.ttlMs });
    return resolved;
  }
}

function transportRequestCacheKey(request: TransportSearchRequest): string {
  return JSON.stringify({
    version: request.version,
    tripId: request.tripId,
    tripRevision: request.tripRevision,
    travelerCount: request.travelerCount,
    budgetLimitRub: request.budgetLimitRub,
    transportPreferenceHints: request.transportPreferenceHints,
    legs: request.legs,
  });
}

export class TemporaryCachedTransportProvider implements TransportProvider {
  readonly id: string;
  private readonly inner: TransportProvider;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, SearchCacheEntry>();

  constructor(inner: TransportProvider, options: { now?: () => Date; ttlMs?: number } = {}) {
    this.inner = inner;
    this.id = inner.id;
    this.now = options.now ?? (() => new Date());
    const ttlMs = options.ttlMs ?? YANDEX_RASP_SEARCH_CACHE_TTL_MS;
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 5 * 60_000) {
      throw new Error('Yandex Rasp search cache TTL is outside the allowed temporary range.');
    }
    this.ttlMs = ttlMs;
  }

  async searchRoutes(request: TransportSearchRequest, context: TransportProviderRequestContext, signal: AbortSignal): Promise<TransportSearchResponse> {
    const key = transportRequestCacheKey(request);
    const nowMs = this.now().getTime();
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > nowMs) {
      return { ...structuredClone(cached.response), requestId: context.requestId };
    }
    const response = await this.inner.searchRoutes(request, context, signal);
    if (this.cache.size >= YANDEX_RASP_MAX_SEARCH_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { response: structuredClone(response), expiresAt: nowMs + this.ttlMs });
    return response;
  }
}

function readBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export const YANDEX_RASP_ATTRIBUTION: YandexRaspLiveAttribution = {
  text: YANDEX_RASP_V3_DESCRIPTOR.attribution.text ?? 'Данные предоставлены сервисом Яндекс.Расписания',
  url: YANDEX_RASP_V3_DESCRIPTOR.attribution.url ?? 'https://rasp.yandex.ru/',
  placement: 'adjacent_to_data',
};

export function createYandexRaspLiveProvider(options: YandexRaspLiveProviderOptions = {}): YandexRaspLiveProviderState {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const apiKey = env.YANDEX_RASP_API_KEY?.trim() ?? '';
  const termsRecheckedAt = env.YANDEX_RASP_TERMS_RECHECKED_AT?.trim() ?? '';
  const quotaConfirmed = readBoolean(env.YANDEX_RASP_QUOTA_CONFIRMED);

  const activation = evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, {
    productAccessModel: 'free_public',
    termsRecheckedAt,
    credentialsConfigured: apiKey.length > 0,
    quotaConfirmed,
    userInitiatedBookingFlowApproved: false,
  }, now());

  const searchTtlMs = options.searchCacheTtlMs ?? YANDEX_RASP_SEARCH_CACHE_TTL_MS;
  const locationDirectoryTtlMs = options.locationDirectoryTtlMs ?? YANDEX_RASP_LOCATION_CACHE_TTL_MS;
  const cachePolicy = {
    persistence: 'temporary_memory_only' as const,
    searchTtlMs,
    locationDirectoryTtlMs,
  };

  if (!activation.eligible || apiKey.length === 0) {
    return {
      status: 'disabled',
      provider: null,
      blockers: [...activation.blockers],
      attribution: YANDEX_RASP_ATTRIBUTION,
      cachePolicy,
    };
  }

  const client = new YandexRaspHttpClient({
    apiKey,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.allowInsecureTestEndpoint === true ? { allowInsecureTestEndpoint: true } : {}),
  });
  const locationResolver = new YandexRaspStationsLocationResolver(client, { now, ttlMs: locationDirectoryTtlMs });
  const adapter = new YandexRaspTransportAdapter({ client, locationResolver, now });
  const provider = new TemporaryCachedTransportProvider(adapter, { now, ttlMs: searchTtlMs });
  return { status: 'ready', provider, blockers: [], attribution: YANDEX_RASP_ATTRIBUTION, cachePolicy };
}
