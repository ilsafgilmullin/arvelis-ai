import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';
import type { DatabaseSync } from 'node:sqlite';
import { PostgresLocationDirectoryActivationRepository } from '../persistence/postgres/locationDirectoryActivationRepository';
import { PostgresLocationDirectoryRepository } from '../persistence/postgres/locationDirectoryRepository';
import { SqliteLocationDirectoryActivationRepository } from '../persistence/sqlite/locationDirectoryActivationRepository';
import { SqliteLocationDirectoryRepository } from '../persistence/sqlite/locationDirectoryRepository';
import { ActiveLocationResolutionService } from './activeLocationResolutionService';
import { parseYandexRaspTrustedBindingsManifest, type YandexRaspBindingEnvironment } from './providers/yandexRaspTrustedBindings';
import { RoutesResolutionService } from './routesResolutionService';

const DEVELOPMENT_BINDINGS_PATH = 'config/yandex-rasp-development-bindings.v1.json';
const PRODUCTION_BINDINGS_PATH = 'config/yandex-rasp-production-bindings.v1.json';

export type RoutesResolutionRuntimeState =
  | { status: 'ready'; service: RoutesResolutionService; bindingEnvironment: YandexRaspBindingEnvironment }
  | { status: 'disabled'; service: null; bindingEnvironment: YandexRaspBindingEnvironment; blocker: 'trusted_bindings_unavailable' };

export type RoutesResolutionRuntimeOptions = {
  database: { provider: 'postgres'; pool: Pool } | { provider: 'sqlite'; database: DatabaseSync };
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  readText?: (path: string) => Promise<string>;
};

/**
 * Composes the authenticated Routes location-resolution runtime from durable ARVELIS
 * Location Directory state and a server-controlled Yandex binding manifest.
 *
 * Production never falls back to development bindings. Missing/invalid bindings disable
 * this runtime slice rather than accepting provider codes from a request or model.
 * The ActiveLocationResolutionService independently fails closed when no directory
 * revision has been explicitly activated.
 */
export async function loadRoutesResolutionRuntime(
  options: RoutesResolutionRuntimeOptions,
): Promise<RoutesResolutionRuntimeState> {
  const env = options.env ?? process.env;
  const bindingEnvironment: YandexRaspBindingEnvironment = env.NODE_ENV === 'production' ? 'production' : 'development';
  const relativePath = bindingEnvironment === 'production' ? PRODUCTION_BINDINGS_PATH : DEVELOPMENT_BINDINGS_PATH;
  const path = resolve(options.cwd ?? process.cwd(), relativePath);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, 'utf8'));

  let bindings;
  try {
    const parsed = JSON.parse(await readText(path)) as unknown;
    bindings = parseYandexRaspTrustedBindingsManifest(parsed, bindingEnvironment);
    if (bindings.size < 1) throw new Error('Empty trusted bindings');
  } catch {
    return { status: 'disabled', service: null, bindingEnvironment, blocker: 'trusted_bindings_unavailable' };
  }

  const repository = options.database.provider === 'postgres'
    ? new PostgresLocationDirectoryRepository(options.database.pool)
    : new SqliteLocationDirectoryRepository(options.database.database);
  const activation = options.database.provider === 'postgres'
    ? new PostgresLocationDirectoryActivationRepository(options.database.pool)
    : new SqliteLocationDirectoryActivationRepository(options.database.database);

  const resolver = new ActiveLocationResolutionService(repository, activation, {
    directoryId: 'arvelis:location-directory:ru',
    source: 'geonames',
    countryCode: 'RU',
  });

  return {
    status: 'ready',
    service: new RoutesResolutionService(resolver, bindings),
    bindingEnvironment,
  };
}
