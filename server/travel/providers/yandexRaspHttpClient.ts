import type {
  YandexRaspClient,
  YandexRaspSearchRequest,
  YandexRaspSearchResponse,
  YandexRaspSegment,
  YandexRaspStation,
  YandexRaspThread,
  YandexRaspTicketsInfo,
} from './yandexRaspAdapter';

export const YANDEX_RASP_API_BASE_URL = 'https://api.rasp.yandex-net.ru/v3.0/';
export const YANDEX_RASP_SEARCH_MAX_BYTES = 4 * 1024 * 1024;
export const YANDEX_RASP_STATIONS_MAX_BYTES = 56 * 1024 * 1024;

export type YandexRaspHttpErrorCode =
  | 'invalid_configuration'
  | 'network_error'
  | 'http_error'
  | 'response_too_large'
  | 'invalid_json'
  | 'invalid_response';

export class YandexRaspHttpError extends Error {
  readonly code: YandexRaspHttpErrorCode;
  readonly status?: number;

  constructor(code: YandexRaspHttpErrorCode, message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'YandexRaspHttpError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, enumerable: false });
  }
}

export type YandexRaspStationsListResponse = {
  countries: unknown[];
};

export type YandexRaspHttpClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  allowInsecureTestEndpoint?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new YandexRaspHttpError('invalid_response', `Yandex Rasp response has invalid ${field}.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, field);
}

function parseStation(value: unknown, field: string): YandexRaspStation {
  if (!isRecord(value)) throw new YandexRaspHttpError('invalid_response', `Yandex Rasp response has invalid ${field}.`);
  const title = requiredString(value.title, `${field}.title`);
  const code = optionalString(value.code, `${field}.code`);
  return { title, ...(code ? { code } : {}) };
}

function parseThread(value: unknown): YandexRaspThread | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid thread.');
  const carrierValue = value.carrier;
  let carrier: { title?: string } | undefined;
  if (carrierValue !== undefined && carrierValue !== null) {
    if (!isRecord(carrierValue)) throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid carrier.');
    const title = optionalString(carrierValue.title, 'carrier.title');
    carrier = title ? { title } : {};
  }
  const uid = optionalString(value.uid, 'thread.uid');
  const number = optionalString(value.number, 'thread.number');
  const transportType = optionalString(value.transport_type, 'thread.transport_type');
  return {
    ...(uid ? { uid } : {}),
    ...(number ? { number } : {}),
    ...(transportType ? { transport_type: transportType } : {}),
    ...(carrier ? { carrier } : {}),
  };
}

function parseTicketsInfo(value: unknown): YandexRaspTicketsInfo | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid tickets_info.');
  if (value.et_marker !== undefined && typeof value.et_marker !== 'boolean') {
    throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid tickets_info.et_marker.');
  }
  const placesValue = value.places;
  let places: NonNullable<YandexRaspTicketsInfo['places']> | undefined;
  if (placesValue !== undefined && placesValue !== null) {
    if (!Array.isArray(placesValue) || placesValue.length > 64) {
      throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid tickets_info.places.');
    }
    places = placesValue.map((item) => {
      if (!isRecord(item) || !isRecord(item.price)) {
        throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid ticket price.');
      }
      if (!Number.isSafeInteger(item.price.whole) || !Number.isSafeInteger(item.price.cents)) {
        throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid ticket price components.');
      }
      const currency = requiredString(item.currency, 'tickets_info.places.currency').toUpperCase();
      const name = optionalString(item.name, 'tickets_info.places.name');
      return {
        currency,
        price: { whole: item.price.whole as number, cents: item.price.cents as number },
        ...(name ? { name } : {}),
      };
    });
  }
  return {
    ...(typeof value.et_marker === 'boolean' ? { et_marker: value.et_marker } : {}),
    ...(places ? { places } : {}),
  };
}

function parseSearchSegment(value: unknown): YandexRaspSegment {
  if (!isRecord(value)) throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid segment.');
  const departure = requiredString(value.departure, 'segment.departure');
  const arrival = requiredString(value.arrival, 'segment.arrival');
  const from = parseStation(value.from, 'segment.from');
  const to = parseStation(value.to, 'segment.to');
  const thread = parseThread(value.thread);
  const ticketsInfo = parseTicketsInfo(value.tickets_info);
  if (value.has_transfers !== undefined && typeof value.has_transfers !== 'boolean') {
    throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp response has invalid has_transfers.');
  }
  return {
    departure,
    arrival,
    from,
    to,
    ...(thread ? { thread } : {}),
    ...(typeof value.has_transfers === 'boolean' ? { has_transfers: value.has_transfers } : {}),
    ...(ticketsInfo ? { tickets_info: ticketsInfo } : {}),
  };
}

function parseSearchResponse(value: unknown): YandexRaspSearchResponse {
  if (!isRecord(value)) throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp search response must be an object.');
  const segmentsValue = value.segments;
  if (segmentsValue === undefined || segmentsValue === null) return { segments: [] };
  if (!Array.isArray(segmentsValue) || segmentsValue.length > 100) {
    throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp search response has invalid segments.');
  }
  return { segments: segmentsValue.map(parseSearchSegment) };
}

function parseStationsList(value: unknown): YandexRaspStationsListResponse {
  if (!isRecord(value) || !Array.isArray(value.countries) || value.countries.length > 512) {
    throw new YandexRaspHttpError('invalid_response', 'Yandex Rasp stations list has invalid shape.');
  }
  return { countries: value.countries };
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new YandexRaspHttpError('response_too_large', 'Yandex Rasp response exceeded the configured size limit.');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function normalizeBaseUrl(value: string, allowInsecureTestEndpoint: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new YandexRaspHttpError('invalid_configuration', 'Yandex Rasp base URL is invalid.', undefined, error);
  }
  if (allowInsecureTestEndpoint) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new YandexRaspHttpError('invalid_configuration', 'Yandex Rasp test endpoint must use HTTP or HTTPS.');
    }
  } else if (url.protocol !== 'https:' || url.hostname !== 'api.rasp.yandex-net.ru') {
    throw new YandexRaspHttpError('invalid_configuration', 'Yandex Rasp live endpoint must use the approved HTTPS host.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

export class YandexRaspHttpClient implements YandexRaspClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: YandexRaspHttpClientOptions) {
    const apiKey = options.apiKey.trim();
    if (apiKey.length === 0 || apiKey.length > 512) {
      throw new YandexRaspHttpError('invalid_configuration', 'Yandex Rasp API key is missing or invalid.');
    }
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? YANDEX_RASP_API_BASE_URL, options.allowInsecureTestEndpoint === true);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(path: string, params: Record<string, string>, signal: AbortSignal, maxBytes: number): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: this.apiKey,
        },
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new YandexRaspHttpError('network_error', 'Yandex Rasp request failed before a response was received.', undefined, error);
    }
    if (!response.ok) {
      throw new YandexRaspHttpError('http_error', `Yandex Rasp request failed with HTTP ${response.status}.`, response.status);
    }
    const text = await readTextLimited(response, maxBytes);
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new YandexRaspHttpError('invalid_json', 'Yandex Rasp returned invalid JSON.', response.status, error);
    }
  }

  async searchPointToPoint(request: YandexRaspSearchRequest, signal: AbortSignal): Promise<YandexRaspSearchResponse> {
    const value = await this.getJson('search/', {
      format: 'json',
      lang: 'ru_RU',
      from: request.fromCode,
      to: request.toCode,
      date: request.date,
      limit: '100',
      transfers: 'false',
    }, signal, YANDEX_RASP_SEARCH_MAX_BYTES);
    return parseSearchResponse(value);
  }

  async getStationsList(signal: AbortSignal): Promise<YandexRaspStationsListResponse> {
    const value = await this.getJson('stations_list/', {
      format: 'json',
      lang: 'ru_RU',
    }, signal, YANDEX_RASP_STATIONS_MAX_BYTES);
    return parseStationsList(value);
  }
}
