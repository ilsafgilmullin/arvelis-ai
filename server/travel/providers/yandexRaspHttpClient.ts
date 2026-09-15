import type { YandexMappedSearch } from './yandexRaspSearchMapping';
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
  | 'invalid_response'
  | 'invalid_content_type'
  | 'timeout'
  | 'aborted';

export class YandexRaspHttpError extends Error {
  readonly code: YandexRaspHttpErrorCode;
  readonly status?: number;
  timing?: YandexHttpTiming;

  constructor(code: YandexRaspHttpErrorCode, message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'YandexRaspHttpError';
    this.code = code;
    if (status !== undefined) this.status = status;
    // Never attach native errors: they may contain a URL/header or raw response.
    void cause;
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
  timeoutMs?: number;
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

async function readTextLimited(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      if (signal.aborted) throw new YandexRaspHttpError('aborted', 'Yandex response read stopped.');
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
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
    try { return new TextDecoder('utf-8', { fatal: true }).decode(joined); }
    catch { throw new YandexRaspHttpError('invalid_response', 'Invalid Yandex response encoding.'); }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

function normalizeBaseUrl(value: string, allowInsecureTestEndpoint: boolean): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new YandexRaspHttpError('invalid_configuration', 'Invalid Yandex endpoint.'); }
  const loopback = allowInsecureTestEndpoint && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
  const live = url.protocol === 'https:' && url.hostname === 'api.rasp.yandex-net.ru' && url.port === '';
  if ((!loopback && !live) || url.username || url.password || url.search || url.hash || url.pathname !== '/v3.0/') {
    throw new YandexRaspHttpError('invalid_configuration', 'Yandex endpoint is outside the approved boundary.');
  }
  return url.toString();
}

export type YandexHttpTiming = { networkStartedAt: string; networkEndedAt: string; networkMs: number; parseMs: number };

export class YandexRaspHttpClient implements YandexRaspClient {
  readonly #apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: YandexRaspHttpClientOptions) {
    const apiKey = options.apiKey;
    if (!/^[A-Za-z0-9._-]{8,512}$/.test(apiKey)) {
      throw new YandexRaspHttpError('invalid_configuration', 'Yandex Rasp API key is missing or invalid.');
    }
    this.#apiKey = apiKey;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 15_000) throw new YandexRaspHttpError('invalid_configuration', 'Invalid Yandex HTTP timeout.');
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? YANDEX_RASP_API_BASE_URL, options.allowInsecureTestEndpoint === true);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(path: string, params: Record<string, string>, signal: AbortSignal, maxBytes: number): Promise<{ body: unknown; timing: YandexHttpTiming }> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    let timeout = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    const started = performance.now();
    const networkStartedAt = new Date().toISOString();
    let response: Response | undefined;
    let listener: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      listener = () => reject(new YandexRaspHttpError(timeout ? 'timeout' : 'aborted', 'Yandex request stopped.'));
      controller.signal.addEventListener('abort', listener, { once: true });
    });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    timer = setTimeout(() => { timeout = true; controller.abort(); }, this.timeoutMs);
    const execute = async () => {
      if (controller.signal.aborted) throw new YandexRaspHttpError('aborted', 'Yandex request stopped.');
      response = await this.fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: this.#apiKey }, redirect: 'error', cache: 'no-store', signal: controller.signal });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new YandexRaspHttpError('aborted', 'Yandex request stopped.'); }
      if (response.redirected || (response.url && new URL(response.url).origin !== url.origin)) throw new YandexRaspHttpError('invalid_response', 'Unexpected provider response origin.');
      if (response.status !== 200) throw new YandexRaspHttpError('http_error', 'Yandex HTTP request failed.', response.status);
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new YandexRaspHttpError('invalid_content_type', 'Invalid Yandex response content type.');
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new YandexRaspHttpError('response_too_large', 'Yandex response exceeded size limit.');
      const raw = await readTextLimited(response, maxBytes, controller.signal);
      const networkMs = performance.now() - started; const networkEndedAt = new Date().toISOString();
      const parseStart = performance.now();
      let body: unknown;
      try { body = JSON.parse(raw); } catch { throw new YandexRaspHttpError('invalid_json', 'Invalid Yandex JSON response.'); }
      // Defense against accidental provider echo, including JSON-escaped credentials.
      if (JSON.stringify(body).includes(this.#apiKey)) throw new YandexRaspHttpError('invalid_response', 'Unsafe Yandex response.');
      return { body, timing: { networkStartedAt, networkEndedAt, networkMs, parseMs: performance.now() - parseStart } };
    };
    try { return await Promise.race([stopped, execute()]); }
    catch (error) {
      controller.abort();
      const safe = error instanceof YandexRaspHttpError ? error : new YandexRaspHttpError('network_error', 'Yandex network request failed.');
      safe.timing = { networkStartedAt, networkEndedAt: new Date().toISOString(), networkMs: performance.now() - started, parseMs: 0 };
      throw safe;
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (listener) controller.signal.removeEventListener('abort', listener);
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  }

  async searchPage(mapped: YandexMappedSearch, signal: AbortSignal): Promise<{ body: unknown; timing: YandexHttpTiming }> {
    const params = Object.fromEntries(mapped.params);
    const allowed = ['from', 'to', 'date', 'system', 'format', 'lang', 'transport_types', 'result_timezone', 'transfers', 'limit', 'offset'];
    if (Array.from(mapped.params).length !== allowed.length || Object.keys(params).some((key) => !allowed.includes(key))
      || !/^[cs][1-9]\d{0,11}$/.test(params.from ?? '') || !/^[cs][1-9]\d{0,11}$/.test(params.to ?? '')
      || !/^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') || params.system !== 'yandex' || params.format !== 'json' || params.lang !== 'ru_RU'
      || !['plane', 'train', 'bus', 'suburban', 'water'].includes(params.transport_types ?? '') || params.transfers !== 'false'
      || !['10', '20'].includes(params.limit ?? '') || !['0', params.limit ?? ''].includes(params.offset ?? '') || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(params.result_timezone ?? '')) {
      throw new YandexRaspHttpError('invalid_configuration', 'Invalid mapped Yandex request.');
    }
    return this.getJson('search/', params, signal, 256_000);
  }

  /** Explicit setup operation, never called automatically by search. No provider HTML reaches the UI. */
  async getCopyright(signal: AbortSignal): Promise<{ text: string; url: string; bannerMarkupPresent: boolean }> {
    const { body } = await this.getJson('copyright/', { format: 'json' }, signal, 32_000);
    const value = isRecord(body) && isRecord(body.copyright) ? body.copyright : null;
    if (!value || typeof value.text !== 'string' || value.text.length > 512 || !value.text.includes('Яндекс') || (typeof value.url !== 'string' || !['https://rasp.yandex.ru/', 'http://rasp.yandex.ru/'].includes(value.url))) throw new YandexRaspHttpError('invalid_response', 'Invalid attribution metadata.');
    const banners = ['logo_vm', 'logo_vd', 'logo_vy', 'logo_hm', 'logo_hd', 'logo_hy'];
    if (banners.some((key) => typeof value[key] !== 'string' || (value[key] as string).length > 4096)) throw new YandexRaspHttpError('invalid_response', 'Invalid attribution banners.');
    return { text: value.text, url: 'https://rasp.yandex.ru/', bannerMarkupPresent: true };
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
    return parseSearchResponse(value.body);
  }

  async getStationsList(signal: AbortSignal): Promise<YandexRaspStationsListResponse> {
    const value = await this.getJson('stations_list/', {
      format: 'json',
      lang: 'ru_RU',
    }, signal, YANDEX_RASP_STATIONS_MAX_BYTES);
    return parseStationsList(value.body);
  }
}
