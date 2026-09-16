import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  GeoNamesIngestionEvaluationError,
  MAX_GEONAMES_EVAL_BYTES,
  evaluateGeoNamesTsvLines,
} from '../server/travel/locationSources/geonamesIngestionEvaluation';

async function main(): Promise<void> {
  const [, , inputArg, countryCode = 'RU', ...probeNames] = process.argv;
  if (!inputArg) throw new GeoNamesIngestionEvaluationError('invalid_evaluation_request');

  const inputPath = resolve(inputArg);
  const metadata = await stat(inputPath);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_GEONAMES_EVAL_BYTES) {
    throw new GeoNamesIngestionEvaluationError('evaluation_bounds_exceeded');
  }

  const stream = createReadStream(inputPath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    const report = await evaluateGeoNamesTsvLines(lines, { countryCode, probeNames });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    lines.close();
    stream.destroy();
  }
}

void main().catch((error: unknown) => {
  const code = error instanceof GeoNamesIngestionEvaluationError ? error.code : 'evaluation_failed';
  console.error(`GeoNames controlled ingestion evaluation failed: ${code}`);
  process.exitCode = 1;
});
