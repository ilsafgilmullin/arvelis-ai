import { createHash } from 'node:crypto';
import {
  GeoNamesIngestionEvaluationError,
  MAX_GEONAMES_EVAL_BYTES,
  MAX_GEONAMES_EVAL_LINES,
  evaluateGeoNamesTsvLines,
  type GeoNamesControlledIngestionReportV1,
} from './geonamesIngestionEvaluation';
import {
  parseGeoNamesDumpLine,
  validateGeoNamesDumpManifestV1,
  type GeoNamesDumpManifestV1,
} from './geonamesSource';
import {
  geoNamesManifestToDirectoryRevision,
  geoNamesSeedToDirectoryLocation,
} from './geonamesDirectoryAdapter';
import {
  LocationDirectoryIngestionService,
  type LocationDirectoryRepository,
} from '../locationDirectoryFoundation';

export const GEONAMES_CONTROLLED_DIRECTORY_IMPORT_VERSION = 1 as const;
export const MAX_GEONAMES_IMPORT_ACCEPTED_RECORDS = 500_000;
export const MAX_GEONAMES_IMPORT_INVALID_RECORDS = 100_000;
export const MAX_GEONAMES_IMPORT_INVALID_RATIO = 0.01;
export const MAX_GEONAMES_IMPORT_WRITE_CONCURRENCY = 8;

export type GeoNamesLineSourceFactory = () => AsyncIterable<string>;

export type GeoNamesControlledDirectoryImportOptions = {
  /**
   * Explicit operator-approved ceiling. The importer never infers that all accepted
   * records should be persisted merely because the source parses.
   */
  maxAcceptedRecords: number;
  /**
   * Explicit operator-approved invalid-row budget. For datasets with at least 1,000 rows,
   * a hard 1% invalid-row ratio ceiling also applies.
   */
  maxInvalidRecords: number;
  writeConcurrency?: number;
  signal?: AbortSignal;
  locationIdFactory?: () => string;
};

export type GeoNamesControlledDirectoryImportReportV1 = {
  version: 1;
  source: 'geonames';
  countryCode: string;
  sourceRevision: string;
  sourceDigestSha256: string;
  totalLines: number;
  totalBytesApprox: number;
  accepted: number;
  ignored: number;
  invalid: number;
  persisted: number;
  byType: { city: number; station: number; airport: number };
  aliasesTruncated: number;
};

export type GeoNamesControlledDirectoryImportErrorCode =
  | 'invalid_import_request'
  | 'aborted'
  | 'preflight_rejected'
  | 'source_changed'
  | 'persistence_failed';

export class GeoNamesControlledDirectoryImportError extends Error {
  constructor(readonly code: GeoNamesControlledDirectoryImportErrorCode) {
    super(`GeoNames controlled directory import: ${code}`);
    this.name = 'GeoNamesControlledDirectoryImportError';
  }
}

type SourceDigest = {
  sha256: string;
  totalLines: number;
  totalBytesApprox: number;
};

function validOptions(options: GeoNamesControlledDirectoryImportOptions): boolean {
  const concurrency = options.writeConcurrency ?? 4;
  return Number.isInteger(options.maxAcceptedRecords)
    && options.maxAcceptedRecords >= 1
    && options.maxAcceptedRecords <= MAX_GEONAMES_IMPORT_ACCEPTED_RECORDS
    && Number.isInteger(options.maxInvalidRecords)
    && options.maxInvalidRecords >= 0
    && options.maxInvalidRecords <= MAX_GEONAMES_IMPORT_INVALID_RECORDS
    && Number.isInteger(concurrency)
    && concurrency >= 1
    && concurrency <= MAX_GEONAMES_IMPORT_WRITE_CONCURRENCY
    && (options.locationIdFactory === undefined || typeof options.locationIdFactory === 'function');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GeoNamesControlledDirectoryImportError('aborted');
}

function invalidRatio(report: GeoNamesControlledIngestionReportV1): number {
  return report.totalLines === 0 ? 0 : report.invalid / report.totalLines;
}

function preflightAccepted(
  report: GeoNamesControlledIngestionReportV1,
  options: GeoNamesControlledDirectoryImportOptions,
): boolean {
  return report.accepted > 0
    && report.accepted <= options.maxAcceptedRecords
    && report.invalid <= options.maxInvalidRecords
    && (report.totalLines < 1_000 || invalidRatio(report) <= MAX_GEONAMES_IMPORT_INVALID_RATIO);
}

async function preflightWithDigest(
  openLines: GeoNamesLineSourceFactory,
  countryCode: string,
  signal: AbortSignal | undefined,
): Promise<{ report: GeoNamesControlledIngestionReportV1; digest: SourceDigest }> {
  const hash = createHash('sha256');
  let totalLines = 0;
  let totalBytesApprox = 0;
  const encoder = new TextEncoder();

  async function* lines(): AsyncGenerator<string> {
    for await (const line of openLines()) {
      throwIfAborted(signal);
      totalLines += 1;
      totalBytesApprox += encoder.encode(line).length + 1;
      hash.update(line, 'utf8');
      hash.update('\n', 'utf8');
      yield line;
    }
  }

  try {
    const report = await evaluateGeoNamesTsvLines(lines(), { countryCode });
    return {
      report,
      digest: {
        sha256: hash.digest('hex'),
        totalLines,
        totalBytesApprox,
      },
    };
  } catch (error) {
    if (error instanceof GeoNamesControlledDirectoryImportError) throw error;
    if (error instanceof GeoNamesIngestionEvaluationError) {
      throw new GeoNamesControlledDirectoryImportError('preflight_rejected');
    }
    throw new GeoNamesControlledDirectoryImportError('preflight_rejected');
  }
}

async function digestSource(
  openLines: GeoNamesLineSourceFactory,
  signal: AbortSignal | undefined,
): Promise<SourceDigest> {
  const hash = createHash('sha256');
  const encoder = new TextEncoder();
  let totalLines = 0;
  let totalBytesApprox = 0;

  try {
    for await (const line of openLines()) {
      throwIfAborted(signal);
      totalLines += 1;
      totalBytesApprox += encoder.encode(line).length + 1;
      if (totalLines > MAX_GEONAMES_EVAL_LINES || totalBytesApprox > MAX_GEONAMES_EVAL_BYTES) {
        throw new GeoNamesControlledDirectoryImportError('preflight_rejected');
      }
      hash.update(line, 'utf8');
      hash.update('\n', 'utf8');
    }
  } catch (error) {
    if (error instanceof GeoNamesControlledDirectoryImportError) throw error;
    throw new GeoNamesControlledDirectoryImportError('preflight_rejected');
  }

  return { sha256: hash.digest('hex'), totalLines, totalBytesApprox };
}

function sameDigest(left: SourceDigest, right: SourceDigest): boolean {
  return left.sha256 === right.sha256
    && left.totalLines === right.totalLines
    && left.totalBytesApprox === right.totalBytesApprox;
}

export class GeoNamesControlledDirectoryImporter {
  constructor(private readonly repository: LocationDirectoryRepository) {}

  async import(
    manifest: GeoNamesDumpManifestV1,
    openLines: GeoNamesLineSourceFactory,
    options: GeoNamesControlledDirectoryImportOptions,
  ): Promise<GeoNamesControlledDirectoryImportReportV1> {
    if (!validOptions(options) || typeof openLines !== 'function') {
      throw new GeoNamesControlledDirectoryImportError('invalid_import_request');
    }
    throwIfAborted(options.signal);

    const manifestValidation = validateGeoNamesDumpManifestV1(manifest);
    if (!manifestValidation.ok) {
      throw new GeoNamesControlledDirectoryImportError('invalid_import_request');
    }

    const preflight = await preflightWithDigest(
      openLines,
      manifestValidation.manifest.countryCode,
      options.signal,
    );
    if (!sameDigest(preflight.digest, {
      sha256: preflight.digest.sha256,
      totalLines: preflight.report.totalLines,
      totalBytesApprox: preflight.report.totalBytesApprox,
    }) || !preflightAccepted(preflight.report, options)) {
      throw new GeoNamesControlledDirectoryImportError('preflight_rejected');
    }

    // A second full pass verifies that the source is stable before any persistence begins.
    const verifiedDigest = await digestSource(openLines, options.signal);
    if (!sameDigest(preflight.digest, verifiedDigest)) {
      throw new GeoNamesControlledDirectoryImportError('source_changed');
    }

    const revision = geoNamesManifestToDirectoryRevision(manifestValidation.manifest);
    const ingestion = new LocationDirectoryIngestionService(this.repository, {
      ...(options.locationIdFactory ? { locationIdFactory: options.locationIdFactory } : {}),
    });

    try {
      await ingestion.registerRevision(revision);
    } catch {
      throw new GeoNamesControlledDirectoryImportError('persistence_failed');
    }

    const concurrency = options.writeConcurrency ?? 4;
    const hash = createHash('sha256');
    const encoder = new TextEncoder();
    let totalLines = 0;
    let totalBytesApprox = 0;
    let accepted = 0;
    let ignored = 0;
    let invalid = 0;
    let persisted = 0;
    const byType = { city: 0, station: 0, airport: 0 };
    let aliasesTruncated = 0;
    let pending: ReturnType<typeof geoNamesSeedToDirectoryLocation>[] = [];

    const flush = async (): Promise<void> => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      const results = await Promise.allSettled(batch.map((location) => ingestion.upsert(location)));
      if (results.some((result) => result.status === 'rejected')) {
        throw new GeoNamesControlledDirectoryImportError('persistence_failed');
      }
      persisted += batch.length;
    };

    try {
      for await (const line of openLines()) {
        throwIfAborted(options.signal);
        totalLines += 1;
        totalBytesApprox += encoder.encode(line).length + 1;
        if (totalLines > MAX_GEONAMES_EVAL_LINES || totalBytesApprox > MAX_GEONAMES_EVAL_BYTES) {
          throw new GeoNamesControlledDirectoryImportError('source_changed');
        }
        hash.update(line, 'utf8');
        hash.update('\n', 'utf8');

        const parsed = parseGeoNamesDumpLine(line, manifestValidation.manifest.countryCode);
        if (parsed.status === 'ignored') {
          ignored += 1;
          continue;
        }
        if (parsed.status === 'invalid') {
          invalid += 1;
          if (invalid > options.maxInvalidRecords) {
            throw new GeoNamesControlledDirectoryImportError('source_changed');
          }
          continue;
        }

        accepted += 1;
        if (accepted > options.maxAcceptedRecords) {
          throw new GeoNamesControlledDirectoryImportError('source_changed');
        }
        byType[parsed.seed.type] += 1;
        if (parsed.seed.aliasesTruncated) aliasesTruncated += 1;
        pending.push(geoNamesSeedToDirectoryLocation(parsed.seed, revision.revision));
        if (pending.length >= concurrency) await flush();
      }
      await flush();
    } catch (error) {
      if (error instanceof GeoNamesControlledDirectoryImportError) throw error;
      throw new GeoNamesControlledDirectoryImportError('persistence_failed');
    }

    const importDigest: SourceDigest = {
      sha256: hash.digest('hex'),
      totalLines,
      totalBytesApprox,
    };
    if (!sameDigest(preflight.digest, importDigest)
      || accepted !== preflight.report.accepted
      || ignored !== preflight.report.ignored
      || invalid !== preflight.report.invalid
      || persisted !== accepted) {
      throw new GeoNamesControlledDirectoryImportError('source_changed');
    }

    return {
      version: GEONAMES_CONTROLLED_DIRECTORY_IMPORT_VERSION,
      source: 'geonames',
      countryCode: manifestValidation.manifest.countryCode,
      sourceRevision: revision.revision,
      sourceDigestSha256: importDigest.sha256,
      totalLines,
      totalBytesApprox,
      accepted,
      ignored,
      invalid,
      persisted,
      byType,
      aliasesTruncated,
    };
  }
}
