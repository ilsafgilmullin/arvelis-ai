import { evaluateTransportRoutePolicy, validateTransportSearchResponse, type TransportSearchResponse, type NormalizedTransportMode } from '../../src/travel/transportContracts';
import { isSafeTransportJson, isTransportCurrency, transportLocalDate, transportSearchCompleteness, validateTransportSearchRequestV1, type TransportSearchIssue, type TransportSearchRequestV1 } from '../../src/travel/transportSearchRequest';
import type { AiToolEvidenceInput, AiToolRegistration } from './aiEnginePorts';
import { evaluateTransportProviderActivation, type TransportProviderActivationContext, type TransportProviderDescriptor } from './transportProviderPolicy';

export type TransportSearchContext = {
  accountScopeId: string;
  /** Supplied only after repository ownership authorization, like AiGatewayServerContext. */
  authorizedTripId: string;
  requestId: string;
  signal: AbortSignal;
};

/** New production port. The legacy Trip planner searchRoutes port remains compatible. */
export interface NormalizedTransportProvider {
  readonly id: string;
  readonly supportedModes: readonly NormalizedTransportMode[];
  readonly maxTransfers: number;
  readonly sourceUrl: string;
  readonly activation:
    | { kind: 'synthetic'; label: 'SYNTHETIC EVALUATION ONLY' }
    | { kind: 'provider'; descriptor: TransportProviderDescriptor; context: TransportProviderActivationContext };
  /** No currency conversion. A quoted price must be a total for the supplied passenger request. */
  search(request: TransportSearchRequestV1, context: TransportSearchContext): Promise<TransportSearchResponse>;
}

export type TransportSearchFailureCode = TransportSearchIssue['code'] | 'provider_not_configured' | 'provider_unavailable' | 'provider_timeout' | 'provider_rate_limited' | 'provider_unauthorized' | 'unsupported_request' | 'aborted' | 'access_denied' | 'malformed_provider_response' | 'unsupported_constraint';
export type TransportSearchOutcome =
  | { status: 'results' | 'no_results'; response: TransportSearchResponse; evidence: AiToolEvidenceInput[] }
  | { status: 'not_executed' | 'failed'; code: TransportSearchFailureCode; issues?: TransportSearchIssue[] };

export class TransportSearchError extends Error {
  constructor(readonly outcome: Exclude<TransportSearchOutcome, { response: TransportSearchResponse }>) {
    super(`Transport search: ${outcome.code}`);
    this.name = 'TransportSearchError';
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OFFSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const timestamp = (value: string) => OFFSET_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10)
  && Number(value.slice(11, 13)) < 24;
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const keys = (value: object, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key));
function strictResponse(response: TransportSearchResponse): boolean {
  return keys(response, ['version', 'providerId', 'requestId', 'retrievedAt', 'routes', 'metadata']) && response.routes.every((route) =>
    keys(route, ['id', 'legId', 'providerRouteId', 'segments', 'price', 'availability', 'validUntil', 'sourceUrl', 'retrievedAt'])
    && (!route.price || keys(route.price, ['amountMinor', 'currency', 'semantics']))
    && route.segments.every((segment) => keys(segment, ['id', 'mode', 'from', 'to', 'departureAt', 'arrivalAt', 'carrierName', 'serviceNumber'])
      && keys(segment.from, ['label', 'code', 'locationId']) && keys(segment.to, ['label', 'code', 'locationId'])));
}

export class TransportSearchService {
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  constructor(private readonly provider: NormalizedTransportProvider | null, options: { timeoutMs?: number; now?: () => Date } = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000) throw new Error('Invalid transport timeout configuration.');
    this.now = options.now ?? (() => new Date());
  }

  async search(input: unknown, context: TransportSearchContext): Promise<TransportSearchOutcome> {
    if (!validId(context.accountScopeId) || !validId(context.authorizedTripId) || !validId(context.requestId)) return { status: 'not_executed', code: 'access_denied' };
    if (context.signal.aborted) return { status: 'not_executed', code: 'aborted' };
    const validation = validateTransportSearchRequestV1(input, this.now());
    if (!validation.ok) return { status: 'not_executed', code: validation.issues[0]!.code, issues: validation.issues };
    const request = validation.request;
    const unresolved = transportSearchCompleteness(request);
    if (unresolved.length) return { status: 'not_executed', code: 'unresolved_location', issues: unresolved };
    const provider = this.provider;
    if (!provider) return { status: 'not_executed', code: 'provider_not_configured' };
    if (provider.activation.kind === 'provider' && (provider.activation.descriptor.id !== provider.id || !evaluateTransportProviderActivation(provider.activation.descriptor, provider.activation.context, this.now()).eligible)) return { status: 'not_executed', code: 'provider_not_configured' };
    if (!validId(provider.id) || !provider.sourceUrl.startsWith('https://')) return { status: 'not_executed', code: 'provider_not_configured' };
    if ((request.allowedModes?.some((mode) => !provider.supportedModes.includes(mode))) || (request.preferredMode && !provider.supportedModes.includes(request.preferredMode))) return { status: 'not_executed', code: 'unsupported_transport_mode' };
    if (provider.supportedModes.length === 0) return { status: 'not_executed', code: 'unsupported_transport_mode' };
    if (request.constraints?.maxTransfers !== undefined && request.constraints.maxTransfers > provider.maxTransfers) return { status: 'not_executed', code: 'unsupported_constraint' };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let listener: (() => void) | undefined;
    const failure = (code: TransportSearchFailureCode): TransportSearchOutcome => ({ status: 'failed', code });
    try {
      const stopped = new Promise<TransportSearchOutcome>((resolve) => {
        listener = () => { controller.abort(); resolve(failure('aborted')); };
        context.signal.addEventListener('abort', listener, { once: true });
        timer = setTimeout(() => { controller.abort(); resolve(failure('provider_timeout')); }, this.timeoutMs);
      });
      const execution = Promise.resolve().then(() => provider.search(structuredClone(request), { ...context, signal: controller.signal })).then((response): TransportSearchOutcome => {
        if (controller.signal.aborted) return failure(context.signal.aborted ? 'aborted' : 'provider_timeout');
        const now = this.now();
        // The existing normalized validator remains mandatory. The boundary also handles hostile nested shapes.
        try {
          if (!isSafeTransportJson(response, 256_000) || validateTransportSearchResponse(response, provider.id, context.requestId, request.returnDate ? ['outbound', 'return'] : ['outbound']).length) return failure('malformed_provider_response');
          if (!strictResponse(response) || !timestamp(response.retrievedAt) || Date.parse(response.retrievedAt) > now.getTime() || response.routes.length > 20) return failure('malformed_provider_response');
          for (const route of response.routes) {
            if (route.retrievedAt && (!timestamp(route.retrievedAt) || Date.parse(route.retrievedAt) > now.getTime())) return failure('malformed_provider_response');
            if (response.metadata && (!route.retrievedAt || !route.validUntil || Date.parse(route.validUntil) - Date.parse(route.retrievedAt) !== response.metadata.freshnessPolicy.ttlMs)) return failure('malformed_provider_response');
            if (route.price && !isTransportCurrency(route.price.currency)) return failure('malformed_provider_response');
            if (route.validUntil && (!timestamp(route.validUntil) || Date.parse(route.validUntil) - Date.parse(response.retrievedAt) > 900_000)) return failure('malformed_provider_response');
            if (route.segments.length - 1 > (request.constraints?.maxTransfers ?? provider.maxTransfers)) return failure('malformed_provider_response');
            const date = route.legId === 'outbound' ? request.departureDate : request.returnDate;
            const from = route.legId === 'outbound' ? request.origin : request.destination;
            const to = route.legId === 'outbound' ? request.destination : request.origin;
            if (from.resolution !== 'resolved' || to.resolution !== 'resolved' || route.segments[0]!.from.locationId !== from.locationId || route.segments.at(-1)!.to.locationId !== to.locationId) return failure('malformed_provider_response');
            if (transportLocalDate(new Date(route.segments[0]!.departureAt), request.timezone) !== date) return failure('malformed_provider_response');
            for (const segment of route.segments) {
              if (!timestamp(segment.departureAt) || !timestamp(segment.arrivalAt) || !provider.supportedModes.includes(segment.mode) || (request.allowedModes && !request.allowedModes.includes(segment.mode))) return failure('malformed_provider_response');
            }
          }
          const evidence = response.routes.flatMap((route, index): AiToolEvidenceInput[] => {
            const policy = evaluateTransportRoutePolicy(route, response, now);
            const freshness = route.validUntil && Date.parse(route.validUntil) <= now.getTime() ? 'expired' as const : policy.freshness === 'unspecified' ? 'unknown' as const : policy.freshness;
            const dataKind = provider.activation.kind === 'synthetic' ? 'synthetic' as const : 'provider' as const;
            const common = {
              sourceType: 'provider' as const, providerId: provider.id, sourceUrl: provider.sourceUrl,
              retrievedAt: route.retrievedAt ?? response.retrievedAt, ...(route.validUntil ? { expiresAt: route.validUntil } : {}),
              provenance: { requestId: response.requestId, routeId: route.id, providerRouteId: route.providerRouteId, dataKind },
            };
            const prefix = dataKind === 'synthetic' ? 'SYNTHETIC EVALUATION ONLY: ' : '';
            const items: AiToolEvidenceInput[] = [{ ...common, id: `route-${index}-schedule`, domain: 'transport_schedule', freshness,
              text: prefix + JSON.stringify({ legId: route.legId, segments: route.segments,
                ...(response.metadata ? { coverage: response.metadata.coverage.status, freshnessPolicy: response.metadata.freshnessPolicy.id, providerGuarantee: false } : {}) }) }];
            if (route.price) items.push({ ...common, id: `route-${index}-price`, domain: 'price',
              freshness: freshness === 'current' && route.price.semantics !== 'quoted' ? 'unknown' : freshness,
              text: prefix + JSON.stringify({ routeId: route.id, price: route.price, priceBasis: route.price.semantics === 'quoted' ? 'request_total' : 'observation_not_current_quote', passengers: request.passengers }) });
            if (route.availability !== 'unknown') items.push({ ...common, id: `route-${index}-availability`, domain: 'availability', freshness, text: prefix + JSON.stringify({ routeId: route.id, availability: route.availability }) });
            return items;
          });
          if (evidence.some((item) => item.text.length > 4_000)) return failure('malformed_provider_response');
          if (!response.routes.length && response.metadata?.coverage.status === 'partial') return failure('unsupported_request');
          return { status: response.routes.length ? 'results' : 'no_results', response: structuredClone(response), evidence };
        } catch { return failure('malformed_provider_response'); }
      }).catch((error: unknown): TransportSearchOutcome => {
        if (controller.signal.aborted) return failure(context.signal.aborted ? 'aborted' : 'provider_timeout');
        // Preserve only known typed codes, never provider messages, raw bodies or causes.
        if (error instanceof TransportSearchError && ['provider_not_configured', 'provider_timeout', 'provider_rate_limited', 'provider_unauthorized', 'unsupported_request', 'malformed_provider_response', 'unresolved_location', 'unsupported_transport_mode', 'unsupported_constraint', 'invalid_search_request', 'aborted'].includes(error.outcome.code)) {
          return { status: error.outcome.status === 'not_executed' ? 'not_executed' : 'failed', code: error.outcome.code };
        }
        return failure('provider_unavailable');
      });
      return await Promise.race([stopped, execution]);
    } finally {
      if (timer) clearTimeout(timer);
      if (listener) context.signal.removeEventListener('abort', listener);
    }
  }
}

export function registerTransportSearchTool(service: TransportSearchService): AiToolRegistration {
  return { id: 'transport.search', async handler(input, context, signal) {
    const result = await service.search(input, { accountScopeId: context.accountScopeId, authorizedTripId: context.authorizedTripId ?? '', requestId: context.requestId, signal });
    if (!('response' in result)) throw new TransportSearchError(result);
    if (result.status === 'no_results') return { evidence: [], outcome: result };
    return { evidence: result.evidence };
  } };
}
