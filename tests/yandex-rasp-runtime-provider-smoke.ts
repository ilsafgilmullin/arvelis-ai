import assert from 'node:assert/strict';
import { loadYandexRaspRuntimeProvider } from '../server/travel/providers/yandexRaspRuntimeProvider';

const NOW = new Date('2026-09-16T12:00:00.000Z');
const DEVELOPMENT_MANIFEST = JSON.stringify({
  version: 1,
  environment: 'development',
  entries: [
    {
      locationId: 'arvelis:dev:station:moscow-kazansky',
      locationType: 'station',
      searchCode: 's2000003',
      stationCodes: ['s2000003'],
      verifiedAt: '2026-09-15T20:34:06.000Z',
    },
    {
      locationId: 'arvelis:dev:station:kazan-pass',
      locationType: 'station',
      searchCode: 's9623141',
      stationCodes: ['s9623141'],
      verifiedAt: '2026-09-15T20:34:06.000Z',
    },
  ],
});

const BASE_ENV = {
  NODE_ENV: 'development',
  YANDEX_RASP_API_KEY: 'development-key-12345',
  YANDEX_RASP_NETWORK_ENABLED: 'false',
  YANDEX_RASP_FREE_PUBLIC_CONFIRMED: 'false',
  YANDEX_RASP_QUOTA_CONFIRMED: 'false',
  YANDEX_RASP_ATTRIBUTION_IMPLEMENTED: 'false',
  YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED: 'false',
  YANDEX_RASP_TERMS_RECHECKED_AT: NOW.toISOString(),
} as const;

let fetchCalls = 0;
const forbiddenFetch: typeof fetch = async () => {
  fetchCalls += 1;
  throw new Error('Runtime composition must not perform provider network I/O.');
};

const disabled = await loadYandexRaspRuntimeProvider({
  env: BASE_ENV,
  cwd: '/repo',
  now: () => NOW,
  fetchImpl: forbiddenFetch,
  readText: async (path) => {
    assert.equal(path, '/repo/config/yandex-rasp-development-bindings.v1.json');
    return DEVELOPMENT_MANIFEST;
  },
});
assert.equal(disabled.status, 'disabled');
assert.equal(disabled.provider, null);
assert.equal(disabled.bindingEnvironment, 'development');
assert.equal(disabled.bindingStatus, 'loaded');
assert.equal(disabled.credentialStatus, 'configured');
assert.ok(disabled.blockers.includes('network_not_enabled'));
assert.ok(disabled.blockers.includes('attribution_not_implemented'));
assert.equal(fetchCalls, 0);

const configured = await loadYandexRaspRuntimeProvider({
  env: {
    ...BASE_ENV,
    YANDEX_RASP_NETWORK_ENABLED: 'true',
    YANDEX_RASP_FREE_PUBLIC_CONFIRMED: 'true',
    YANDEX_RASP_QUOTA_CONFIRMED: 'true',
    YANDEX_RASP_ATTRIBUTION_IMPLEMENTED: 'true',
    YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED: 'true',
  },
  cwd: '/repo',
  now: () => NOW,
  fetchImpl: forbiddenFetch,
  readText: async () => DEVELOPMENT_MANIFEST,
});
assert.equal(configured.status, 'configured');
assert.ok(configured.provider);
assert.equal(configured.bindingStatus, 'loaded');
assert.equal(configured.blockers.length, 0);
assert.equal(fetchCalls, 0, 'factory must remain network-free');

const missing = await loadYandexRaspRuntimeProvider({
  env: BASE_ENV,
  readText: async () => { throw new Error('missing'); },
  now: () => NOW,
});
assert.equal(missing.status, 'disabled');
assert.equal(missing.provider, null);
assert.equal(missing.bindingStatus, 'missing_or_invalid');
assert.deepEqual(missing.blockers, ['trusted_bindings_unavailable']);

const productionRejectsDevelopmentManifest = await loadYandexRaspRuntimeProvider({
  env: { ...BASE_ENV, NODE_ENV: 'production' },
  cwd: '/repo',
  readText: async (path) => {
    assert.equal(path, '/repo/config/yandex-rasp-production-bindings.v1.json');
    return DEVELOPMENT_MANIFEST;
  },
  now: () => NOW,
});
assert.equal(productionRejectsDevelopmentManifest.status, 'disabled');
assert.equal(productionRejectsDevelopmentManifest.bindingEnvironment, 'production');
assert.equal(productionRejectsDevelopmentManifest.bindingStatus, 'missing_or_invalid');
assert.deepEqual(productionRejectsDevelopmentManifest.blockers, ['trusted_bindings_unavailable']);

const invalidManifest = await loadYandexRaspRuntimeProvider({
  env: BASE_ENV,
  readText: async () => JSON.stringify({ version: 1, environment: 'development', entries: [{ locationId: 'arvelis:bad' }] }),
  now: () => NOW,
});
assert.equal(invalidManifest.status, 'disabled');
assert.equal(invalidManifest.provider, null);
assert.equal(invalidManifest.bindingStatus, 'missing_or_invalid');
assert.equal(fetchCalls, 0);

console.log('Yandex Rasp runtime provider composition: PASS');
