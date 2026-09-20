import './routes-resolution-authenticated-runtime-smoke';
import assert from 'node:assert/strict';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';
import { loadRoutesResolutionRuntime } from '../server/travel/routesResolutionRuntime';

const manifest = JSON.stringify({
  version: 1,
  environment: 'development',
  entries: [{
    locationId: 'arvelis:runtime:test-city',
    locationType: 'city',
    searchCode: 'c100',
    stationCodes: ['s101'],
    verifiedAt: '2026-09-20T00:00:00.000Z',
  }],
});

async function main() {
  const database = openSqliteAuthDatabase(':memory:');
  try {
    const development = await loadRoutesResolutionRuntime({
      database: { provider: 'sqlite', database },
      env: { NODE_ENV: 'development' },
      readText: async (path) => {
        assert.match(path, /yandex-rasp-development-bindings\.v1\.json$/);
        return manifest;
      },
    });
    assert.equal(development.status, 'ready');
    if (development.status !== 'ready') throw new Error('Expected ready development runtime');

    const controller = new AbortController();
    const unresolved = await development.service.resolve({
      version: 1,
      origin: 'Москва',
      destination: 'Казань',
      locale: 'ru-RU',
      countryCode: 'RU',
    }, {
      accountScopeId: 'account-runtime-test',
      requestId: 'routes-runtime-test',
      signal: controller.signal,
    });
    assert.deepEqual(unresolved, { status: 'blocked', field: 'origin', code: 'location_resolution_failed' });

    let productionPath = '';
    const production = await loadRoutesResolutionRuntime({
      database: { provider: 'sqlite', database },
      env: { NODE_ENV: 'production' },
      readText: async (path) => {
        productionPath = path;
        return manifest;
      },
    });
    assert.match(productionPath, /yandex-rasp-production-bindings\.v1\.json$/);
    assert.deepEqual(production, {
      status: 'disabled',
      service: null,
      bindingEnvironment: 'production',
      blocker: 'trusted_bindings_unavailable',
    });

    const invalid = await loadRoutesResolutionRuntime({
      database: { provider: 'sqlite', database },
      env: { NODE_ENV: 'development' },
      readText: async () => '{"version":1,"environment":"development","entries":[],"unexpected":true}',
    });
    assert.deepEqual(invalid, {
      status: 'disabled',
      service: null,
      bindingEnvironment: 'development',
      blocker: 'trusted_bindings_unavailable',
    });

    console.log('Routes resolution runtime smoke passed.');
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
