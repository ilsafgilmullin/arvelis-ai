/** Provider-neutral, server/presentation metadata. Never serialize wholesale into a model turn. */
export type TransportResultMetadata = {
  coverage: { status: 'complete' | 'partial'; reasons: Array<'page_limit' | 'result_limit' | 'interval_services_unsupported'>; pages: number };
  attribution: { required: boolean; providerName: string; text: string; url: string; placement: 'adjacent_to_data'; bannerRequired: boolean };
  /** ARVELIS retrieval-age bound, explicitly NOT a provider accuracy/availability guarantee. */
  freshnessPolicy: { id: string; kind: 'retrieval_window'; ttlMs: number; providerGuarantee: false };
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);

export function validTransportResultMetadata(value: unknown): value is TransportResultMetadata {
  if (!record(value) || !keys(value, ['coverage', 'attribution', 'freshnessPolicy'])) return false;
  const { coverage: c, attribution: a, freshnessPolicy: f } = value;
  if (!record(c) || !keys(c, ['status', 'reasons', 'pages']) || !['complete', 'partial'].includes(c.status as string)
    || !Number.isInteger(c.pages) || (c.pages as number) < 1 || (c.pages as number) > 20
    || !Array.isArray(c.reasons) || c.reasons.length > 3 || new Set(c.reasons).size !== c.reasons.length
    || c.reasons.some((r) => !['page_limit', 'result_limit', 'interval_services_unsupported'].includes(r))
    || (c.status === 'complete') !== (c.reasons.length === 0)) return false;
  if (!record(a) || !keys(a, ['required', 'providerName', 'text', 'url', 'placement', 'bannerRequired'])
    || typeof a.required !== 'boolean' || typeof a.bannerRequired !== 'boolean' || a.placement !== 'adjacent_to_data'
    || !text(a.providerName, 160) || !text(a.text, 512) || !text(a.url, 2048)) return false;
  try { const u = new URL(a.url); if (u.protocol !== 'https:' || u.username || u.password) return false; } catch { return false; }
  return record(f) && keys(f, ['id', 'kind', 'ttlMs', 'providerGuarantee']) && text(f.id, 128)
    && /^[A-Za-z0-9._:-]+$/.test(f.id) && f.kind === 'retrieval_window' && f.providerGuarantee === false
    && Number.isInteger(f.ttlMs) && (f.ttlMs as number) >= 1 && (f.ttlMs as number) <= 900_000;
}
