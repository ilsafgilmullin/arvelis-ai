import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { PostgresLocationDirectoryActivationRepository } from '../server/persistence/postgres/locationDirectoryActivationRepository';
import { PostgresLocationDirectoryRepository } from '../server/persistence/postgres/locationDirectoryRepository';
import { LocationDirectoryActivationService } from '../server/travel/locationDirectoryActivation';
import { LocationDirectoryIngestionService, type LocationDirectoryRevisionV1 } from '../server/travel/locationDirectoryFoundation';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL activation smoke');
  const pool = new Pool({ connectionString, max: 2, application_name: 'arvelis-location-activation-smoke' });
  const suffix = `${process.pid}-${Date.now()}`;
  const makeRevision = (version: string, fingerprint: string): LocationDirectoryRevisionV1 => ({
    version: 1,
    source: 'geonames',
    revision: `geonames:ZZ:pg-activation:${version}:${suffix}`,
    countryCode: 'ZZ',
    sourceModifiedDate: '2026-09-18',
    retrievedAt: '2026-09-18T06:00:00.000Z',
    sourceFingerprint: fingerprint.repeat(64),
    license: 'CC-BY-4.0',
    attributionUrl: 'https://www.geonames.org/',
  });

  try {
    const migration = await pool.query<{ id: string }>(
      "SELECT id FROM arvelis_schema_migrations WHERE id = '005_location_directory_revision_activation'",
    );
    assert.equal(migration.rows[0]?.id, '005_location_directory_revision_activation');

    const ingestion = new LocationDirectoryIngestionService(new PostgresLocationDirectoryRepository(pool));
    const first = makeRevision('v1', '7');
    const second = makeRevision('v2', '8');
    await ingestion.registerRevision(first);
    await ingestion.registerRevision(second);

    const repository = new PostgresLocationDirectoryActivationRepository(pool);
    const service = new LocationDirectoryActivationService(repository);
    await service.activate({
      source: 'geonames', countryCode: 'ZZ', revision: first.revision,
      expectedCurrentRevision: null, activatedAt: '2026-09-18T07:10:00.000Z',
    });
    await assert.rejects(service.activate({
      source: 'geonames', countryCode: 'ZZ', revision: second.revision,
      expectedCurrentRevision: null, activatedAt: '2026-09-18T07:11:00.000Z',
    }), /active revision changed/);
    const secondActivation = await service.activate({
      source: 'geonames', countryCode: 'ZZ', revision: second.revision,
      expectedCurrentRevision: first.revision, activatedAt: '2026-09-18T07:12:00.000Z',
    });
    assert.equal(secondActivation.previousRevision, first.revision);
    assert.equal((await repository.getActive('geonames', 'ZZ'))?.revision, second.revision);

    const audit = await pool.query<{ revision: string; previous_revision: string | null }>(`
      SELECT revision, previous_revision FROM travel_location_directory_activation_audit
      WHERE source = 'geonames' AND country_code = 'ZZ' ORDER BY activation_id
    `);
    assert.deepEqual(audit.rows, [
      { revision: first.revision, previous_revision: null },
      { revision: second.revision, previous_revision: first.revision },
    ]);

    console.log('Location Directory PostgreSQL Activation Persistence V1: PASS');
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
