import assert from 'node:assert/strict';
import {
  InMemoryLocationDirectoryActivationRepository,
  LocationDirectoryActivationService,
} from '../server/travel/locationDirectoryActivation';
import type { LocationDirectoryRevisionV1 } from '../server/travel/locationDirectoryFoundation';

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

  console.log('Location directory revision activation smoke passed');
}

void main();
