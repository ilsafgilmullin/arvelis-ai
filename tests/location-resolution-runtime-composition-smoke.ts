import assert from 'node:assert/strict';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import {
  createRuntimeLocationResolutionService,
  RUNTIME_LOCATION_COUNTRY_CODE,
  RUNTIME_LOCATION_DIRECTORY_ID,
} from '../server/runtime/locationResolutionComposition';

async function main(): Promise<void> {
  assert.equal(RUNTIME_LOCATION_DIRECTORY_ID, 'arvelis-geonames-ru');
  assert.equal(RUNTIME_LOCATION_COUNTRY_CODE, 'RU');

  const database = openSqliteAuthDatabase(':memory:');
  try {
    const service = createRuntimeLocationResolutionService({ provider: 'sqlite', database });

    const controller = new AbortController();
    const result = await service.resolve(
      { version: 1, rawLabel: 'Москва', countryCode: 'RU', limit: 5 },
      { accountScopeId: 'qualification-account', requestId: 'qualification-request', signal: controller.signal },
    );

    assert.deepEqual(result, { status: 'not_executed', code: 'resolver_not_configured' });

    const wrongCountry = await service.resolve(
      { version: 1, rawLabel: 'Москва', countryCode: 'FI', limit: 5 },
      { accountScopeId: 'qualification-account', requestId: 'qualification-country', signal: controller.signal },
    );
    assert.deepEqual(wrongCountry, { status: 'not_executed', code: 'resolver_not_configured' });

    const aborted = new AbortController();
    aborted.abort();
    const abortedResult = await service.resolve(
      { version: 1, rawLabel: 'Москва', countryCode: 'RU', limit: 5 },
      { accountScopeId: 'qualification-account', requestId: 'qualification-abort', signal: aborted.signal },
    );
    assert.deepEqual(abortedResult, { status: 'not_executed', code: 'aborted' });
  } finally {
    database.close();
  }

  console.log('location resolution runtime composition smoke: PASS');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
