import { validateTransportSearchResponse, type NormalizedTransportMode, type TransportSearchResponse } from '../../../src/travel/transportContracts';
import type { TransportResultMetadata } from '../../../src/travel/transportResultMetadata';
import { transportLocalDate, type TransportSearchRequestV1 } from '../../../src/travel/transportSearchRequest';
import { TransportSearchError, type NormalizedTransportProvider, type TransportSearchContext, type TransportSearchFailureCode } from '../transportSearchService';
import { evaluateTransportProviderActivation, YANDEX_RASP_V3_DESCRIPTOR, type TransportProviderActivationContext } from '../transportProviderPolicy';
import { YandexRaspHttpClient, YandexRaspHttpError } from './yandexRaspHttpClient';
import { mapYandexSearchRequest, mapYandexSearchResponse, YandexSearchMappingError, type YandexLocationBindings } from './yandexRaspSearchMapping';
import { validateYandexSearchPage } from './yandexRaspResponseValidation';

const MODES = ['flight', 'train', 'bus', 'suburbanRail', 'ferry'] as const;
export const YANDEX_SCHEDULE_FRESHNESS = Object.freeze({ id: 'arvelis-schedule-retrieval-5m-v1', kind: 'retrieval_window' as const, ttlMs: 300_000, providerGuarantee: false as const });
export const YANDEX_LIVE_ATTRIBUTION = Object.freeze({ required: true, providerName: 'Яндекс Расписания', text: 'Данные предоставлены сервисом Яндекс.Расписания', url: 'https://rasp.yandex.ru/', placement: 'adjacent_to_data' as const, bannerRequired: true });
export type YandexProviderTelemetry = {
  providerId: 'yandex-rasp-v3'; operation: 'search'; requestId: string;
  status: 'results' | 'no_results' | 'failed'; code?: TransportSearchFailureCode;
  durationMs: number; networkMs: number; parseValidationMs: number; normalizationMs: number;
  networkStartedAt?: string; networkEndedAt?: string; resultCount: number; pages: number;
};
const failure = (code: TransportSearchFailureCode, status: 'failed' | 'not_executed' = 'failed') => new TransportSearchError({ status, code });

/** Application budget, not a claim about Yandex's issued-key quota. Share across requests. */
export class YandexRaspRateBudget {
  private start = 0;
  private used = 0;
  private active = false;
  constructor(private readonly now = () => Date.now()) {}
  enter() { if (this.active) throw failure('provider_rate_limited'); this.active = true; }
  leave() { this.active = false; }
  take(limit: number) {
    const now = this.now();
    if (now - this.start >= 60_000) { this.start = now; this.used = 0; }
    if (this.used >= limit) throw failure('provider_rate_limited');
    this.used += 1;
  }
}
const processBudget = new YandexRaspRateBudget();

export type YandexNormalizedProviderOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  /** Trusted resolver/directory bindings supplied by server composition, never user input. */
  bindings: YandexLocationBindings;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  telemetry?: (event: YandexProviderTelemetry) => void;
  budget?: YandexRaspRateBudget;
};
export type YandexNormalizedProviderState = {
  status: 'disabled' | 'configured'; provider: NormalizedTransportProvider | null;
  credentialStatus: 'configured' | 'not configured'; blockers: string[];
  attribution: typeof YANDEX_LIVE_ATTRIBUTION;
};

class YandexRaspNormalizedProvider implements NormalizedTransportProvider {
  readonly id = 'yandex-rasp-v3';
  readonly supportedModes: readonly NormalizedTransportMode[] = MODES;
  readonly maxTransfers = 0;
  readonly sourceUrl = 'https://rasp.yandex.ru/';
  readonly #client: YandexRaspHttpClient;
  readonly #bindings: YandexLocationBindings;
  get activation(): NormalizedTransportProvider['activation'] {
    return { kind: 'provider', descriptor: structuredClone(YANDEX_RASP_V3_DESCRIPTOR), context: structuredClone(this.activationContext) };
  }
  constructor(private readonly options: YandexNormalizedProviderOptions, private readonly activationContext: TransportProviderActivationContext,
    apiKey: string, private readonly timeoutMs: number, private readonly perMinute: number) {
    this.#client = new YandexRaspHttpClient({ apiKey, timeoutMs, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    this.#bindings = new Map(Array.from(options.bindings, ([id, binding]) => [id, structuredClone(binding)]));
  }

  async search(request: TransportSearchRequestV1, context: TransportSearchContext): Promise<TransportSearchResponse> {
    const now = this.options.now ?? (() => new Date());
    if (!evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, this.activationContext, now()).eligible) throw failure('provider_not_configured', 'not_executed');
    if (context.signal.aborted) throw failure('aborted', 'not_executed');
    if (![context.requestId, context.accountScopeId, context.authorizedTripId].every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))) throw failure('access_denied', 'not_executed');
    let mapped;
    try { mapped = mapYandexSearchRequest(request, this.#bindings, now()); }
    catch (error) { throw failure(error instanceof YandexSearchMappingError ? error.code : 'invalid_search_request', 'not_executed'); }
    const budget = this.options.budget ?? processBudget;
    budget.enter();
    const controller = new AbortController(); const abort = () => controller.abort();
    let timedOut = false;
    const started = performance.now();
    let networkInFlightAt: number | undefined;
    const event: YandexProviderTelemetry = { providerId: this.id, operation: 'search', requestId: context.requestId, status: 'failed', durationMs: 0, networkMs: 0, parseValidationMs: 0, normalizationMs: 0, resultCount: 0, pages: 0 };
    let stopListener: (() => void) | undefined;
    const stopped = new Promise<never>((_, reject) => {
      stopListener = () => reject(failure(timedOut ? 'provider_timeout' : 'aborted'));
      controller.signal.addEventListener('abort', stopListener, { once: true });
    });
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const execute = async (): Promise<TransportSearchResponse> => {
      const routes: TransportSearchResponse['routes'] = [];
      const reasons = new Set<TransportResultMetadata['coverage']['reasons'][number]>();
      let firstRetrievedAt: string | undefined;
      const seen = new Set<string>();
      for (const [operationIndex, operation] of mapped.entries()) {
        let total: number | undefined;
        for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
          if (controller.signal.aborted) throw failure(timedOut ? 'provider_timeout' : 'aborted');
          budget.take(this.perMinute);
          const pageRequest = { ...operation, params: new URLSearchParams(operation.params) };
          pageRequest.params.set('limit', '10');
          pageRequest.params.set('offset', String(pageIndex * 10));
          networkInFlightAt = performance.now();
          event.networkStartedAt ??= new Date().toISOString();
          const http = await this.#client.searchPage(pageRequest, controller.signal);
          networkInFlightAt = undefined;
          event.pages += 1; event.networkMs += http.timing.networkMs; event.parseValidationMs += http.timing.parseMs;
          event.networkStartedAt ??= http.timing.networkStartedAt; event.networkEndedAt = http.timing.networkEndedAt;
          const retrievedAt = now(); firstRetrievedAt ??= retrievedAt.toISOString();
          const validateStart = performance.now();
          const page = validateYandexSearchPage(http.body, pageRequest);
          event.parseValidationMs += performance.now() - validateStart;
          if (total !== undefined && total !== page.pagination.total) throw failure('malformed_provider_response');
          total = page.pagination.total;
          if (page.intervalCount) reasons.add('interval_services_unsupported');
          const normalizeStart = performance.now();
          const normalized = mapYandexSearchResponse({ segments: page.segments, pagination: { total: page.segments.length } }, request, pageRequest, context.requestId, retrievedAt);
          for (const route of normalized.routes) {
            const identity = `${route.legId}:${route.providerRouteId}:${route.segments[0]!.departureAt}`;
            if (seen.has(identity)) throw failure('malformed_provider_response');
            seen.add(identity);
            if (transportLocalDate(new Date(route.segments[0]!.departureAt), request.timezone) !== pageRequest.params.get('date')) throw failure('malformed_provider_response');
            if (routes.length === 20) { reasons.add('result_limit'); break; }
            route.id = `yr:${route.legId}:${operationIndex}:${pageIndex}:${routes.length}`;
            route.segments[0]!.id = `${route.id}:segment`;
            route.retrievedAt = retrievedAt.toISOString();
            route.validUntil = new Date(retrievedAt.getTime() + YANDEX_SCHEDULE_FRESHNESS.ttlMs).toISOString();
            routes.push(route);
          }
          event.normalizationMs += performance.now() - normalizeStart;
          const hasMore = page.pagination.offset + page.segments.length < page.pagination.total;
          if (hasMore && pageIndex === 1) reasons.add('page_limit');
          if (routes.length === 20) {
            if (hasMore || operationIndex < mapped.length - 1) reasons.add('result_limit');
            break;
          }
          if (!hasMore || page.intervalCount > 0) break;
          if (page.segments.length !== 10) throw failure('malformed_provider_response');
        }
        if (routes.length === 20) break;
      }
      if (controller.signal.aborted) throw failure(timedOut ? 'provider_timeout' : 'aborted');
      const response: TransportSearchResponse = { version: 1, providerId: this.id, requestId: context.requestId, retrievedAt: firstRetrievedAt ?? now().toISOString(), routes,
        metadata: { coverage: { status: reasons.size ? 'partial' : 'complete', reasons: [...reasons], pages: event.pages }, attribution: { ...YANDEX_LIVE_ATTRIBUTION }, freshnessPolicy: { ...YANDEX_SCHEDULE_FRESHNESS } } };
      if (validateTransportSearchResponse(response, this.id, context.requestId, request.returnDate ? ['outbound', 'return'] : ['outbound']).length) throw failure('malformed_provider_response');
      if (!routes.length && reasons.size) throw failure('unsupported_request');
      return response;
    };
    try {
      const response = await Promise.race([stopped, execute()]);
      event.status = response.routes.length ? 'results' : 'no_results'; event.resultCount = response.routes.length;
      return response;
    } catch (error) {
      controller.abort();
      let code: TransportSearchFailureCode = 'provider_unavailable';
      if (error instanceof TransportSearchError) code = error.outcome.code;
      else if (error instanceof YandexSearchMappingError) code = error.code === 'unsupported_constraint' ? 'unsupported_request' : 'malformed_provider_response';
      else if (error instanceof YandexRaspHttpError) {
        if (error.timing) {
          event.networkStartedAt ??= error.timing.networkStartedAt; event.networkEndedAt = error.timing.networkEndedAt;
          event.networkMs += error.timing.networkMs;
          networkInFlightAt = undefined;
        }
        if (error.code === 'timeout') code = 'provider_timeout';
        else if (error.code === 'aborted') code = timedOut ? 'provider_timeout' : 'aborted';
        else if (error.status === 401 || error.status === 403) code = 'provider_unauthorized';
        else if (error.status === 429) code = 'provider_rate_limited';
        else if (error.status === 400 || error.status === 404) code = 'unsupported_request';
        else if (['invalid_response', 'invalid_json', 'invalid_content_type', 'response_too_large'].includes(error.code)) code = 'malformed_provider_response';
      }
      event.code = code; throw failure(code);
    } finally {
      clearTimeout(timer); context.signal.removeEventListener('abort', abort);
      if (stopListener) controller.signal.removeEventListener('abort', stopListener);
      budget.leave(); event.durationMs = performance.now() - started;
      if (networkInFlightAt !== undefined) { event.networkEndedAt = new Date().toISOString(); event.networkMs += performance.now() - networkInFlightAt; }
      // Observability is best effort and must never alter results or qualification semantics.
      try { this.options.telemetry?.({ ...event }); } catch { /* callback isolated */ }
    }
  }
}

/** No network in the factory. All policy gates remain mandatory on each search. */
export function createYandexRaspNormalizedProvider(options: YandexNormalizedProviderOptions): YandexNormalizedProviderState {
  const env = options.env ?? process.env; const now = options.now ?? (() => new Date());
  const key = env.YANDEX_RASP_API_KEY ?? '';
  const credentialsConfigured = /^[A-Za-z0-9._-]{8,512}$/.test(key);
  const activation: TransportProviderActivationContext = {
    productAccessModel: env.YANDEX_RASP_FREE_PUBLIC_CONFIRMED === 'true' ? 'free_public' : 'paid_or_restricted',
    termsRecheckedAt: env.YANDEX_RASP_TERMS_RECHECKED_AT ?? '', credentialsConfigured,
    quotaConfirmed: env.YANDEX_RASP_QUOTA_CONFIRMED === 'true', attributionImplemented: env.YANDEX_RASP_ATTRIBUTION_IMPLEMENTED === 'true',
    operationalPolicyAccepted: env.YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED === 'true', userInitiatedBookingFlowApproved: false,
  };
  const blockers: string[] = [...evaluateTransportProviderActivation(YANDEX_RASP_V3_DESCRIPTOR, activation, now()).blockers];
  if (env.YANDEX_RASP_NETWORK_ENABLED !== 'true') blockers.push('network_not_enabled');
  const timeoutMs = env.YANDEX_RASP_TIMEOUT_MS === undefined ? 10_000 : Number(env.YANDEX_RASP_TIMEOUT_MS);
  const perMinute = env.YANDEX_RASP_REQUESTS_PER_MINUTE === undefined ? 30 : Number(env.YANDEX_RASP_REQUESTS_PER_MINUTE);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000 || !Number.isInteger(perMinute) || perMinute < 1 || perMinute > 60) blockers.push('invalid_operational_limits');
  const credentialStatus = credentialsConfigured ? 'configured' as const : 'not configured' as const;
  if (blockers.length) return { status: 'disabled', provider: null, credentialStatus, blockers, attribution: YANDEX_LIVE_ATTRIBUTION };
  // Do not retain environment/key in an enumerable options object.
  const { env: _env, ...safeOptions } = options;
  return { status: 'configured', provider: new YandexRaspNormalizedProvider(safeOptions, activation, key, timeoutMs, perMinute), credentialStatus, blockers: [], attribution: YANDEX_LIVE_ATTRIBUTION };
}
