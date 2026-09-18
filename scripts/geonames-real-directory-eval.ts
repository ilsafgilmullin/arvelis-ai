import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import { SqliteLocationDirectoryRepository } from '../server/persistence/sqlite/locationDirectoryRepository';
import {
  GeoNamesControlledDirectoryImporter,
  type GeoNamesLineSourceFactory,
} from '../server/travel/locationSources/geonamesControlledDirectoryImport';
import type { GeoNamesDumpManifestV1 } from '../server/travel/locationSources/geonamesSource';
import {
  geoNamesManifestToDirectoryRevision,
} from '../server/travel/locationSources/geonamesDirectoryAdapter';
import {
  RepositoryTravelLocationDirectory,
} from '../server/travel/locationDirectoryFoundation';
import { LocationResolutionService } from '../server/travel/locationResolutionService';

const MAX_TSV_BYTES = 512 * 1024 * 1024;
const MAX_ACCEPTED = 250_000;
const MAX_INVALID = 1_000;

function sourceFactory(inputPath: string): GeoNamesLineSourceFactory {
  return () => (async function* (): AsyncGenerator<string> {
    const stream = createReadStream(inputPath, { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) yield line;
    } finally {
      lines.close();
      stream.destroy();
    }
  })();
}

async function resolveProbe(
  directory: RepositoryTravelLocationDirectory,
  rawLabel: string,
  types?: Array<'city' | 'station' | 'airport'>,
) {
  const result = await new LocationResolutionService(directory, { timeoutMs: 15_000 }).resolve({
    version: 1,
    rawLabel,
    locale: 'ru-RU',
    countryCode: 'RU',
    ...(types ? { types } : {}),
    limit: 10,
  }, {
    accountScopeId: 'real-geonames-evidence',
    requestId: `probe:${rawLabel}`,
    signal: new AbortController().signal,
  });

  if (!('response' in result)) {
    throw new Error(`location_probe_failed:${rawLabel}:${result.code}`);
  }
  if (result.status === 'unresolved' || result.response.candidates.length < 1) {
    throw new Error(`location_probe_unresolved:${rawLabel}`);
  }
  if (result.response.candidates.some((candidate) => !candidate.locationId.startsWith('arvelis:location:'))) {
    throw new Error(`location_probe_external_identity_leak:${rawLabel}`);
  }

  return {
    rawLabel,
    status: result.status,
    candidateCount: result.response.candidates.length,
    candidates: result.response.candidates.map((candidate) => ({
      locationId: candidate.locationId,
      displayName: candidate.displayName,
      type: candidate.type,
      countryCode: candidate.countryCode,
      region: candidate.region,
    })),
  };
}

async function main(): Promise<void> {
  const [, , tsvArg, manifestArg] = process.argv;
  if (!tsvArg || !manifestArg) {
    throw new Error('usage: geonames-real-directory-eval <RU.txt> <manifest.json>');
  }

  const metadata = await stat(tsvArg);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_TSV_BYTES) {
    throw new Error('geonames_real_tsv_size_out_of_bounds');
  }

  const manifest = JSON.parse(await readFile(manifestArg, 'utf8')) as GeoNamesDumpManifestV1;
  const database = openSqliteAuthDatabase(':memory:');
  const repository = new SqliteLocationDirectoryRepository(database);
  const importer = new GeoNamesControlledDirectoryImporter(repository);

  const startedAt = performance.now();
  try {
    const report = await importer.import(manifest, sourceFactory(tsvArg), {
      maxAcceptedRecords: MAX_ACCEPTED,
      maxInvalidRecords: MAX_INVALID,
      writeConcurrency: 1,
    });
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (report.totalLines < 300_000 || report.totalLines > 500_000) {
      throw new Error('geonames_real_total_lines_out_of_expected_bounds');
    }
    if (report.accepted < 150_000 || report.accepted > MAX_ACCEPTED) {
      throw new Error('geonames_real_accepted_out_of_expected_bounds');
    }
    if (report.persisted !== report.accepted) {
      throw new Error('geonames_real_persisted_count_mismatch');
    }
    if (report.ignored < 150_000) {
      throw new Error('geonames_real_ignored_count_out_of_expected_bounds');
    }
    if (report.invalid > MAX_INVALID) {
      throw new Error('geonames_real_invalid_count_out_of_expected_bounds');
    }
    if (report.byType.city < 150_000 || report.byType.station < 5_000 || report.byType.airport < 100) {
      throw new Error('geonames_real_type_coverage_out_of_expected_bounds');
    }

    const revision = geoNamesManifestToDirectoryRevision(manifest);
    if (report.sourceRevision !== revision.revision) {
      throw new Error('geonames_real_revision_mismatch');
    }

    const directory = new RepositoryTravelLocationDirectory(repository, {
      id: 'geonames-real-evidence',
      source: 'geonames',
      revision: revision.revision,
    });

    const probes = [
      await resolveProbe(directory, 'Москва', ['city']),
      await resolveProbe(directory, 'Казань', ['city']),
      await resolveProbe(directory, 'Сочи'),
      await resolveProbe(directory, 'Владивосток'),
    ];

    const memory = process.memoryUsage();
    const evidence = {
      version: 1,
      source: 'geonames',
      countryCode: report.countryCode,
      sourceRevision: report.sourceRevision,
      sourceDigestSha256: report.sourceDigestSha256,
      totalLines: report.totalLines,
      totalBytesApprox: report.totalBytesApprox,
      accepted: report.accepted,
      ignored: report.ignored,
      invalid: report.invalid,
      persisted: report.persisted,
      byType: report.byType,
      aliasesTruncated: report.aliasesTruncated,
      elapsedMs,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      probes,
      database: 'sqlite-memory-ephemeral',
      productionActivated: false,
      rawDataPersisted: false,
    };

    process.stdout.write(`GEONAMES_REAL_DIRECTORY_EVIDENCE=${JSON.stringify(evidence)}\n`);
  } finally {
    database.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  console.error(`GeoNames real directory evaluation failed: ${message}`);
  process.exitCode = 1;
});
