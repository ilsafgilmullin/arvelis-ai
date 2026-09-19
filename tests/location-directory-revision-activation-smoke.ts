import assert from 'node:assert/strict';
import { ActiveLocationResolutionService } from '../server/travel/activeLocationResolutionService';
import {
  InMemoryLocationDirectoryActivationRepository,
  LocationDirectoryActivationService,
  type LocationDirectoryActivationRepository,
} from '../server/travel/locationDirectoryActivation';
import {
  InMemoryLocationDirectoryRepository,
  type LocationDirectoryRevisionV1,
  type LocationDirectorySourceLocationV1,
} from '../server/travel/locationDirectoryFoundation';

const revision = (name: string, countryCode = 'RU'): LocationDirectoryRevisionV1 => ({
  version: 1,
  source: 'geonames',
  revision: name,
  countryCode,
  sourceModifiedDate: '2026-09-17',
  retrievedAt: '2026-09-18T00:00:00.000Z',
  sourceFingerprint: 'a'.repeat(64),
  license: 'CC BY 4.0',
  attributionUrl: 'https://www.geonames.org/',
});

const sourceLocation = (sourceRevision: string, displayName: string): LocationDirectorySourceLocationV1 => ({
  version: 1,
  source: 'geonames',
  sourceRevision,
  externalSourceId: '524901',
  displayName,
  searchNames: ['Москва'],
  type: 'city',
  countryCode: 'RU',
  region: 'Москва',
  timezone: 'Europe/Moscow',
  latitude: 55.75222,
  longitude: 37.61556,
  population: 13010112,
});

const query = {
  version: 1 as const,
  rawLabel: 'Москва',
  locale: 'ru-RU' as const,
  countryCode: 'RU',
};

const context = () => ({
  accountScopeId: 'account-test',
  requestId: 'request-test',
  signal: new AbortController().signal,
});

async function main() {
  const repository = new InMemoryLocationDirectoryActivationRepository();
  const service = new LocationDirectoryActivationService(repository);
  repository.registerRevision(revision('ru-2026-09-17'));
  repository.registerRevision(revision('ru-2026-09-18'));
  repository.registerRevision(revision('kz-2026-09-18', 'KZ'));

  const first = await service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-17',
    expectedCurrentRevision: null, activatedAt: '2026-09-18T01:00:00.000Z',
  });
  assert.equal(first.previousRevision, null);
  assert.equal((await repository.getActive('geonames', 'RU'))?.revision, 'ru-2026-09-17');

  await assert.rejects(() => service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-18',
    expectedCurrentRevision: null, activatedAt: '2026-09-18T01:01:00.000Z',
  }), /active revision changed/);

  const second = await service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-18',
    expectedCurrentRevision: 'ru-2026-09-17', activatedAt: '2026-09-18T01:02:00.000Z',
  });
  assert.equal(second.previousRevision, 'ru-2026-09-17');

  const rollback = await service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-17',
    expectedCurrentRevision: 'ru-2026-09-18', activatedAt: '2026-09-18T01:03:00.000Z',
  });
  assert.equal(rollback.previousRevision, 'ru-2026-09-18');
  assert.equal(repository.audit.length, 3);

  await assert.rejects(() => service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'missing',
    expectedCurrentRevision: 'ru-2026-09-17', activatedAt: '2026-09-18T01:04:00.000Z',
  }), /not registered/);

  await assert.rejects(() => service.activate({
    source: 'geonames', countryCode: 'RU', revision: 'kz-2026-09-18',
    expectedCurrentRevision: 'ru-2026-09-17', activatedAt: '2026-09-18T01:05:00.000Z',
  }), /country mismatch/);

  // Runtime binding qualification: imported revisions are unreadable until explicitly active,
  // and activation/rollback must take effect without recreating the runtime service.
  const directoryRepository = new InMemoryLocationDirectoryRepository();
  const runtimeActivationRepository = new InMemoryLocationDirectoryActivationRepository();
  const runtimeActivationService = new LocationDirectoryActivationService(runtimeActivationRepository);
  for (const item of [revision('ru-2026-09-17'), revision('ru-2026-09-18')]) {
    await directoryRepository.putRevision(item);
    runtimeActivationRepository.registerRevision(item);
  }
  await directoryRepository.upsertSourceLocation(
    sourceLocation('ru-2026-09-17', 'Москва'),
    () => 'arvelis:location:moscow',
  );
  await directoryRepository.upsertSourceLocation(
    sourceLocation('ru-2026-09-18', 'Москва (актуальная)'),
    () => 'arvelis:location:unexpected-new-id',
  );

  const runtime = new ActiveLocationResolutionService(directoryRepository, runtimeActivationRepository, {
    directoryId: 'geonames-ru',
    source: 'geonames',
    countryCode: 'RU',
    timeoutMs: 1_000,
  });

  assert.deepEqual(await runtime.resolve(query, context()), {
    status: 'not_executed', code: 'resolver_not_configured',
  });

  await runtimeActivationService.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-17',
    expectedCurrentRevision: null, activatedAt: '2026-09-18T02:00:00.000Z',
  });
  const resolvedFirst = await runtime.resolve(query, context());
  assert.equal(resolvedFirst.status, 'resolved');
  if (resolvedFirst.status === 'resolved') {
    assert.equal(resolvedFirst.response.directoryRevision, 'ru-2026-09-17');
    assert.equal(resolvedFirst.response.candidates[0]?.displayName, 'Москва');
  }

  await runtimeActivationService.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-18',
    expectedCurrentRevision: 'ru-2026-09-17', activatedAt: '2026-09-18T02:01:00.000Z',
  });
  const resolvedSecond = await runtime.resolve(query, context());
  assert.equal(resolvedSecond.status, 'resolved');
  if (resolvedSecond.status === 'resolved') {
    assert.equal(resolvedSecond.response.directoryRevision, 'ru-2026-09-18');
    assert.equal(resolvedSecond.response.candidates[0]?.displayName, 'Москва (актуальная)');
  }

  await runtimeActivationService.activate({
    source: 'geonames', countryCode: 'RU', revision: 'ru-2026-09-17',
    expectedCurrentRevision: 'ru-2026-09-18', activatedAt: '2026-09-18T02:02:00.000Z',
  });
  const resolvedRollback = await runtime.resolve(query, context());
  assert.equal(resolvedRollback.status, 'resolved');
  if (resolvedRollback.status === 'resolved') {
    assert.equal(resolvedRollback.response.directoryRevision, 'ru-2026-09-17');
  }

  assert.deepEqual(await runtime.resolve({ ...query, countryCode: 'KZ' }, context()), {
    status: 'not_executed', code: 'resolver_not_configured',
  });
  assert.deepEqual(await runtime.resolve({ ...query, countryCode: 'ru' }, context()), {
    status: 'not_executed', code: 'invalid_location_query',
  });

  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await runtime.resolve(query, {
    accountScopeId: 'account-test', requestId: 'request-aborted', signal: aborted.signal,
  }), { status: 'not_executed', code: 'aborted' });

  const unavailableActivation: LocationDirectoryActivationRepository = {
    getRevision: (...args) => runtimeActivationRepository.getRevision(...args),
    getActive: async () => { throw new Error('persistence unavailable'); },
    activate: (input) => runtimeActivationRepository.activate(input),
  };
  const unavailableRuntime = new ActiveLocationResolutionService(directoryRepository, unavailableActivation, {
    directoryId: 'geonames-ru', source: 'geonames', countryCode: 'RU', timeoutMs: 1_000,
  });
  assert.deepEqual(await unavailableRuntime.resolve(query, context()), {
    status: 'failed', code: 'resolver_unavailable',
  });

  const inconsistentActivation: LocationDirectoryActivationRepository = {
    getRevision: (...args) => runtimeActivationRepository.getRevision(...args),
    getActive: async () => ({
      version: 1, source: 'geonames', countryCode: 'RU', revision: 'missing-revision',
      activatedAt: '2026-09-18T02:03:00.000Z', previousRevision: null,
    }),
    activate: (input) => runtimeActivationRepository.activate(input),
  };
  const inconsistentRuntime = new ActiveLocationResolutionService(directoryRepository, inconsistentActivation, {
    directoryId: 'geonames-ru', source: 'geonames', countryCode: 'RU', timeoutMs: 1_000,
  });
  assert.deepEqual(await inconsistentRuntime.resolve(query, context()), {
    status: 'failed', code: 'resolver_unavailable',
  });

  console.log('Location directory revision activation and active runtime binding smoke passed');
}

void main();
