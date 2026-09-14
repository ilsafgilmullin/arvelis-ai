import { validateTransportSearchResponse, type TransportSearchResponse, type NormalizedTransportMode } from '../../../src/travel/transportContracts';
import { isSafeTransportJson, isTransportCurrency, transportSearchCompleteness, validateTransportSearchRequestV1, type TransportSearchRequestV1 } from '../../../src/travel/transportSearchRequest';
import { mapSegment, type YandexRaspSegment } from './yandexRaspAdapter';

/** Adapter-owned bindings from a future trusted resolver/directory, never AI-supplied codes. */
export type YandexLocationBindings = ReadonlyMap<string, { searchCode: string; stationCodes: readonly string[] }>;
export type YandexMappedSearch = { legId: 'outbound' | 'return'; params: URLSearchParams; originStationCodes: readonly string[]; destinationStationCodes: readonly string[] };
export type YandexMappingCode = 'invalid_search_request' | 'unresolved_location' | 'unsupported_transport_mode' | 'unsupported_constraint' | 'malformed_provider_response';
export class YandexSearchMappingError extends Error {
  constructor(readonly code: YandexMappingCode) { super(`Yandex search mapping: ${code}`); }
}
const MODE_MAP: Partial<Record<NormalizedTransportMode, string>> = { flight: 'plane', train: 'train', bus: 'bus', suburbanRail: 'suburban', ferry: 'water' };

/** Pure mapping only: no key, client, environment reads or network execution. */
export function mapYandexSearchRequest(input: TransportSearchRequestV1, bindings: YandexLocationBindings, now: Date): YandexMappedSearch[] {
  const validation = validateTransportSearchRequestV1(input, now);
  if (!validation.ok) throw new YandexSearchMappingError('invalid_search_request');
  const request = validation.request;
  if (transportSearchCompleteness(request).length || request.origin.resolution !== 'resolved' || request.destination.resolution !== 'resolved') throw new YandexSearchMappingError('unresolved_location');
  if (request.constraints?.maxTransfers !== undefined && request.constraints.maxTransfers !== 0) throw new YandexSearchMappingError('unsupported_constraint');
  const modes = request.allowedModes ?? Object.keys(MODE_MAP) as NormalizedTransportMode[];
  if (modes.some((mode) => !MODE_MAP[mode]) || (request.preferredMode && !MODE_MAP[request.preferredMode])) throw new YandexSearchMappingError('unsupported_transport_mode');
  const originBinding = bindings.get(request.origin.locationId);
  const destinationBinding = bindings.get(request.destination.locationId);
  const from = originBinding?.searchCode;
  const to = destinationBinding?.searchCode;
  if (!from || !to || !/^[cs][1-9]\d{0,11}$/.test(from) || !/^[cs][1-9]\d{0,11}$/.test(to) || from === to) throw new YandexSearchMappingError('unresolved_location');
  if (!originBinding || !destinationBinding || [originBinding, destinationBinding].some((binding) => binding.stationCodes.length < 1 || binding.stationCodes.length > 256 || binding.stationCodes.some((code) => !/^s[1-9]\d{0,11}$/.test(code)) || (binding.searchCode.startsWith('s') && (binding.stationCodes.length !== 1 || binding.stationCodes[0] !== binding.searchCode)))) throw new YandexSearchMappingError('unresolved_location');
  const legs = [{ legId: 'outbound' as const, from, to, date: request.departureDate }, ...(request.returnDate ? [{ legId: 'return' as const, from: to, to: from, date: request.returnDate }] : [])];
  // One documented transport_types value per request; no invented comma syntax.
  return legs.flatMap((leg) => modes.map((mode) => ({ legId: leg.legId, originStationCodes: [...(leg.legId === 'outbound' ? originBinding : destinationBinding).stationCodes], destinationStationCodes: [...(leg.legId === 'outbound' ? destinationBinding : originBinding).stationCodes], params: new URLSearchParams({
    from: leg.from, to: leg.to, date: leg.date, system: 'yandex', format: 'json', lang: 'ru_RU',
    transport_types: MODE_MAP[mode]!, result_timezone: request.timezone, transfers: 'false', limit: '20', offset: '0',
  }) })));
}

/** A single, complete direct-service fixture page. Pagination/interval/transfers need a later adapter. */
export function mapYandexSearchResponse(raw: unknown, request: TransportSearchRequestV1, mapped: YandexMappedSearch, requestId: string, retrievedAt: Date): TransportSearchResponse {
  const fail = (): never => { throw new YandexSearchMappingError('malformed_provider_response'); };
  if (!isSafeTransportJson(raw, 256_000) || !raw || typeof raw !== 'object') return fail();
  const page = raw as { segments?: unknown; pagination?: { total?: number }; interval_segments?: unknown[] };
  if (!Array.isArray(page.segments) || page.segments.length > 20 || page.pagination?.total !== page.segments.length || (page.interval_segments !== undefined && (!Array.isArray(page.interval_segments) || page.interval_segments.length > 0))) return fail();
  const origin = mapped.legId === 'outbound' ? request.origin : request.destination;
  const destination = mapped.legId === 'outbound' ? request.destination : request.origin;
  if (origin.resolution !== 'resolved' || destination.resolution !== 'resolved') return fail();
  const routes = page.segments.map((item, index) => {
    if (!item || typeof item !== 'object') return fail();
    const segment = item as YandexRaspSegment;
    if (!segment.thread?.uid || segment.thread.transport_type !== mapped.params.get('transport_types') || segment.has_transfers || !segment.from?.code || !mapped.originStationCodes.includes(segment.from.code) || !segment.to?.code || !mapped.destinationStationCodes.includes(segment.to.code)) return fail();
    const places = segment.tickets_info?.places;
    if (places !== undefined && (!Array.isArray(places) || places.length > 64 || places.some((place) => !place || !isTransportCurrency(place.currency) || !place.price || !Number.isSafeInteger(place.price.whole) || place.price.whole! < 0 || !Number.isInteger(place.price.cents) || place.price.cents! < 0 || place.price.cents! > 99))) return fail();
    if (!segment.departure || !segment.arrival || !/(?:Z|[+-]\d{2}:\d{2})$/.test(segment.departure) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(segment.arrival)) return fail();
    let route;
    try { route = mapSegment({ id: mapped.legId, fromLabel: origin.rawLabel, toLabel: destination.rawLabel, date: mapped.params.get('date')! }, segment, index); } catch { return fail(); }
    if (!route) return fail();
    route.segments[0]!.from.locationId = origin.locationId;
    route.segments[0]!.to.locationId = destination.locationId;
    // Provider tickets_info is an observation, not a passenger-specific current quote.
    if (route.price) route.price.semantics = 'cached_observation';
    // No validity interval is promised by this API; fetching does not manufacture one.
    return route;
  });
  const response: TransportSearchResponse = { version: 1, providerId: 'yandex-rasp-v3', requestId, retrievedAt: retrievedAt.toISOString(), routes };
  if (validateTransportSearchResponse(response, 'yandex-rasp-v3', requestId, [mapped.legId]).length > 0) return fail();
  return response;
}
