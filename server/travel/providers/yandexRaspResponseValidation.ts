import { isSafeTransportJson, isTransportCurrency } from '../../../src/travel/transportSearchRequest';
import type { YandexRaspSegment } from './yandexRaspAdapter';
import { YandexSearchMappingError, type YandexMappedSearch } from './yandexRaspSearchMapping';

export type YandexSearchPage = {
  pagination: { total: number; limit: number; offset: number };
  segments: YandexRaspSegment[];
  intervalCount: number;
};
const fail = (): never => { throw new YandexSearchMappingError('malformed_provider_response'); };
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const text = (v: unknown, max = 160): string => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v) ? v : fail();
const integer = (v: unknown, min: number, max: number): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail();
const optionalText = (v: unknown, max: number): string | undefined => v === undefined || v === null || v === '' ? undefined : text(v, max);

export function validYandexTimestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return false;
  const day = new Date(v.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== v.slice(0, 10)
    || Number(v.slice(11, 13)) > 23 || Number(v.slice(14, 16)) > 59 || Number(v.slice(17, 19)) > 59) return false;
  const offset = v.match(/[+-](\d{2}):(\d{2})$/);
  return Number.isFinite(Date.parse(v)) && (!offset || (Number(offset[1]) <= 14 && Number(offset[2]) <= 59 && (Number(offset[1]) !== 14 || Number(offset[2]) === 0)));
}

function station(v: unknown, codes: readonly string[]) {
  const s = record(v); const code = text(s.code, 32);
  if (!/^s[1-9]\d{0,11}$/.test(code) || !codes.includes(code) || s.type !== 'station') return fail();
  if (s.transport_type !== undefined && !['plane', 'train', 'suburban', 'bus', 'water', 'helicopter'].includes(s.transport_type as string)) return fail();
  const stationTypes = ['station', 'platform', 'stop', 'checkpoint', 'post', 'crossing', 'overtaking_point', 'train_station', 'airport', 'bus_station', 'bus_stop', 'unknown', 'port', 'port_point', 'wharf', 'river_port', 'marine_station'];
  if (s.station_type !== undefined && !stationTypes.includes(s.station_type as string)) return fail();
  return { code, title: text(s.title) };
}

function segment(v: unknown, mapped: YandexMappedSearch, interval: boolean): YandexRaspSegment | null {
  const s = record(v); const t = record(s.thread);
  const from = station(s.from, mapped.originStationCodes); const to = station(s.to, mapped.destinationStationCodes);
  const uid = text(t.uid, 100);
  if (!/^[A-Za-z0-9._:-]+$/.test(uid) || t.transport_type !== mapped.params.get('transport_types') || typeof s.has_transfers !== 'boolean') return fail();
  if (s.has_transfers) throw new YandexSearchMappingError('unsupported_constraint');
  const duration = s.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 31 * 86400) return fail();
  let carrier: { title?: string } | undefined;
  if (t.carrier !== undefined && t.carrier !== null) {
    const c = record(t.carrier); const title = optionalText(c.title, 160);
    if (c.code !== undefined) integer(c.code, 0, 1_000_000_000);
    carrier = title ? { title } : {};
  }
  const number = optionalText(t.number, 80);
  const thread = { uid, transport_type: t.transport_type as string, ...(number ? { number } : {}), ...(carrier ? { carrier } : {}) };
  let tickets: YandexRaspSegment['tickets_info'];
  if (s.tickets_info !== undefined && s.tickets_info !== null) {
    const info = record(s.tickets_info);
    if (info.et_marker !== undefined && typeof info.et_marker !== 'boolean') return fail();
    const places = info.places == null ? [] : info.places;
    if (!Array.isArray(places) || places.length > 64) return fail();
    tickets = { places: places.map((v) => {
      const p = record(v); const price = record(p.price);
      if (!isTransportCurrency(p.currency)) return fail();
      const whole = integer(price.whole, 0, Math.floor(Number.MAX_SAFE_INTEGER / 100) - 1);
      const cents = integer(price.cents, 0, 99); const name = optionalText(p.name, 160);
      return { currency: p.currency, price: { whole, cents }, ...(name ? { name } : {}) };
    }) };
  }
  if (interval) {
    // No point timestamps are invented for interval services. Validate bounded shape, report omission.
    const i = record(t.interval); text(i.density, 512);
    for (const key of ['begin_time', 'end_time']) {
      const time = text(i[key], 64);
      if (!validYandexTimestamp(time) && !validYandexTimestamp(time + 'Z')) return fail();
    }
    return null;
  }
  if (!validYandexTimestamp(s.departure) || !validYandexTimestamp(s.arrival)
    || Math.abs((Date.parse(s.arrival) - Date.parse(s.departure)) / 1000 - duration) > 1) return fail();
  if (s.start_date !== undefined && s.start_date !== mapped.params.get('date')) return fail();
  return { from, to, thread, departure: s.departure, arrival: s.arrival, has_transfers: false, ...(tickets ? { tickets_info: tickets } : {}) };
}

/** Validate the entire bounded JSON envelope before copying a small allowlisted projection. */
export function validateYandexSearchPage(raw: unknown, mapped: YandexMappedSearch): YandexSearchPage {
  if (!isSafeTransportJson(raw, 256_000)) return fail();
  const root = record(raw); const p = record(root.pagination); const search = record(root.search);
  const pagination = { total: integer(p.total, 0, 1_000_000), limit: integer(p.limit, 1, 100), offset: integer(p.offset, 0, 1_000_000) };
  if (pagination.limit !== Number(mapped.params.get('limit')) || pagination.offset !== Number(mapped.params.get('offset')) || search.date !== mapped.params.get('date')) return fail();
  for (const key of ['from', 'to']) {
    const location = record(search[key]); const code = text(location.code, 32);
    if (code !== mapped.params.get(key) || location.type !== (code.startsWith('c') ? 'settlement' : 'station')) return fail();
    text(location.title);
  }
  if (!Array.isArray(root.segments) || !Array.isArray(root.interval_segments) || root.segments.length > pagination.limit
    || root.interval_segments.length > 100 || root.segments.length > Math.max(0, pagination.total - pagination.offset)) return fail();
  const segments = root.segments.map((v) => segment(v, mapped, false)!);
  const identities = segments.map((s) => `${s.thread!.uid}:${s.departure}:${s.from.code}:${s.to.code}`);
  if (new Set(identities).size !== identities.length) return fail();
  for (const v of root.interval_segments) segment(v, mapped, true);
  return { pagination, segments, intervalCount: root.interval_segments.length };
}
