import { parseGeoNamesDumpLine, type GeoNamesLocationSeedV1 } from './geonamesSource';

export const MAX_GEONAMES_EVAL_LINES = 5_000_000;
export const MAX_GEONAMES_EVAL_BYTES = 1_000_000_000;
export const MAX_GEONAMES_EVAL_PRIMARY_KEYS = 500_000;
export const MAX_GEONAMES_EVAL_PROBES = 50;
export const MAX_GEONAMES_EVAL_PROBE_MATCHES = 20;
export const MAX_GEONAMES_EVAL_INVALID_SAMPLES = 20;

export type GeoNamesEvaluationProbeMatchV1 = {
  geonameId: number;
  displayName: string;
  type: GeoNamesLocationSeedV1['type'];
  featureCode: string;
  countryCode: string;
  admin1Code?: string;
};

export type GeoNamesEvaluationProbeV1 = {
  query: string;
  matchCount: number;
  truncated: boolean;
  matches: GeoNamesEvaluationProbeMatchV1[];
};

export type GeoNamesControlledIngestionReportV1 = {
  version: 1;
  source: 'geonames';
  countryCode: string;
  totalLines: number;
  totalBytesApprox: number;
  accepted: number;
  ignored: number;
  invalid: number;
  byType: { city: number; station: number; airport: number };
  byFeatureCode: Record<string, number>;
  aliasesTruncated: number;
  duplicatePrimaryNameGroups: number;
  maxPrimaryNameMultiplicity: number;
  earliestModificationDate?: string;
  latestModificationDate?: string;
  invalidSamples: Array<{ lineNumber: number; code: 'invalid_line' | 'country_mismatch' | 'invalid_target_record' }>;
  probes: GeoNamesEvaluationProbeV1[];
};

export class GeoNamesIngestionEvaluationError extends Error {
  constructor(readonly code: 'invalid_evaluation_request' | 'evaluation_bounds_exceeded') {
    super(`GeoNames ingestion evaluation: ${code}`);
  }
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU');
}

function validProbe(value: string): boolean {
  return value.length > 0
    && value.length <= 160
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function probeMatch(seed: GeoNamesLocationSeedV1): GeoNamesEvaluationProbeMatchV1 {
  return {
    geonameId: seed.geonameId,
    displayName: seed.displayName,
    type: seed.type,
    featureCode: seed.featureCode,
    countryCode: seed.countryCode,
    ...(seed.admin1Code ? { admin1Code: seed.admin1Code } : {}),
  };
}

/**
 * Evaluate a pre-extracted GeoNames TSV stream without persistence or ID minting.
 * The report is aggregate/sanitized: raw rows and full alias lists are never returned.
 */
export async function evaluateGeoNamesTsvLines(
  lines: AsyncIterable<string>,
  options: { countryCode: string; probeNames?: readonly string[] },
): Promise<GeoNamesControlledIngestionReportV1> {
  if (!/^[A-Z]{2}$/.test(options.countryCode)
    || (options.probeNames?.length ?? 0) > MAX_GEONAMES_EVAL_PROBES
    || options.probeNames?.some((probe) => !validProbe(probe))) {
    throw new GeoNamesIngestionEvaluationError('invalid_evaluation_request');
  }

  const probes = new Map<string, { query: string; count: number; matches: GeoNamesEvaluationProbeMatchV1[] }>();
  for (const query of options.probeNames ?? []) {
    const key = normalizeName(query);
    if (!probes.has(key)) probes.set(key, { query, count: 0, matches: [] });
  }

  let totalLines = 0;
  let totalBytesApprox = 0;
  let accepted = 0;
  let ignored = 0;
  let invalid = 0;
  let aliasesTruncated = 0;
  let earliestModificationDate: string | undefined;
  let latestModificationDate: string | undefined;
  const byType = { city: 0, station: 0, airport: 0 };
  const byFeature = new Map<string, number>();
  const primaryNames = new Map<string, number>();
  const invalidSamples: GeoNamesControlledIngestionReportV1['invalidSamples'] = [];
  const encoder = new TextEncoder();

  for await (const line of lines) {
    totalLines += 1;
    totalBytesApprox += encoder.encode(line).length + 1;
    if (totalLines > MAX_GEONAMES_EVAL_LINES || totalBytesApprox > MAX_GEONAMES_EVAL_BYTES) {
      throw new GeoNamesIngestionEvaluationError('evaluation_bounds_exceeded');
    }

    const parsed = parseGeoNamesDumpLine(line, options.countryCode);
    if (parsed.status === 'ignored') {
      ignored += 1;
      continue;
    }
    if (parsed.status === 'invalid') {
      invalid += 1;
      if (invalidSamples.length < MAX_GEONAMES_EVAL_INVALID_SAMPLES) {
        invalidSamples.push({ lineNumber: totalLines, code: parsed.code });
      }
      continue;
    }

    accepted += 1;
    const seed = parsed.seed;
    byType[seed.type] += 1;
    increment(byFeature, seed.featureCode);
    if (seed.aliasesTruncated) aliasesTruncated += 1;
    if (earliestModificationDate === undefined || seed.modificationDate < earliestModificationDate) earliestModificationDate = seed.modificationDate;
    if (latestModificationDate === undefined || seed.modificationDate > latestModificationDate) latestModificationDate = seed.modificationDate;

    const primaryKey = normalizeName(seed.displayName);
    if (!primaryNames.has(primaryKey) && primaryNames.size >= MAX_GEONAMES_EVAL_PRIMARY_KEYS) {
      throw new GeoNamesIngestionEvaluationError('evaluation_bounds_exceeded');
    }
    primaryNames.set(primaryKey, (primaryNames.get(primaryKey) ?? 0) + 1);

    if (probes.size > 0) {
      const matchedKeys = new Set<string>();
      for (const searchName of seed.searchNames) {
        const probeKey = normalizeName(searchName);
        if (matchedKeys.has(probeKey)) continue;
        const probe = probes.get(probeKey);
        if (!probe) continue;
        matchedKeys.add(probeKey);
        probe.count += 1;
        if (probe.matches.length < MAX_GEONAMES_EVAL_PROBE_MATCHES) probe.matches.push(probeMatch(seed));
      }
    }
  }

  let duplicatePrimaryNameGroups = 0;
  let maxPrimaryNameMultiplicity = 0;
  for (const count of primaryNames.values()) {
    if (count > 1) duplicatePrimaryNameGroups += 1;
    if (count > maxPrimaryNameMultiplicity) maxPrimaryNameMultiplicity = count;
  }

  const byFeatureCode = Object.fromEntries([...byFeature.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')));
  const probeReports = [...probes.values()].map((probe) => ({
    query: probe.query,
    matchCount: probe.count,
    truncated: probe.count > probe.matches.length,
    matches: probe.matches,
  }));

  return {
    version: 1,
    source: 'geonames',
    countryCode: options.countryCode,
    totalLines,
    totalBytesApprox,
    accepted,
    ignored,
    invalid,
    byType,
    byFeatureCode,
    aliasesTruncated,
    duplicatePrimaryNameGroups,
    maxPrimaryNameMultiplicity,
    ...(earliestModificationDate ? { earliestModificationDate } : {}),
    ...(latestModificationDate ? { latestModificationDate } : {}),
    invalidSamples,
    probes: probeReports,
  };
}
