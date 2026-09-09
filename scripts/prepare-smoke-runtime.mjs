import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.argv[2];
const allowed = new Map([
  ['auth', 'tests/.dist-auth'],
  ['server-auth', 'tests/.dist-server-auth'],
  ['server-db', 'tests/.dist-server-db'],
  ['server-sqlite', 'tests/.dist-server-sqlite'],
  ['travel', 'tests/.dist-travel'],
  ['trip-server', 'tests/.dist-trip-server'],
  ['trip-postgres', 'tests/.dist-trip-postgres'],
  ['plan-policy', 'tests/.dist-plan-policy'],
  ['transport-policy', 'tests/.dist-transport-policy'],
  ['transport-provider-foundation', 'tests/.dist-transport-provider-foundation'],
  ['yandex-rasp-live', 'tests/.dist-yandex-rasp-live'],
  ['map-provider-foundation', 'tests/.dist-map-provider-foundation'],
  ['legal-foundation', 'tests/.dist-legal-foundation'],
]);

const relative = allowed.get(target);
if (!relative) {
  throw new Error(`Unknown smoke runtime target: ${target ?? '<missing>'}`);
}

const directory = resolve(relative);
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'package.json'), '{"type":"commonjs"}\n', 'utf8');
