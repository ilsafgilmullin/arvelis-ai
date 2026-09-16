import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createYandexRaspNormalizedProvider, YANDEX_LIVE_ATTRIBUTION, type YandexNormalizedProviderState } from './yandexRaspNormalizedProvider';
import { parseYandexRaspTrustedBindingsManifest, type YandexRaspBindingEnvironment } from './yandexRaspTrustedBindings';

const DEVELOPMENT_BINDINGS_PATH = 'config/yandex-rasp-development-bindings.v1.json';
const PRODUCTION_BINDINGS_PATH = 'config/yandex-rasp-production-bindings.v1.json';

export type YandexRaspRuntimeProviderState = YandexNormalizedProviderState & {
  bindingEnvironment: YandexRaspBindingEnvironment;
  bindingStatus: 'loaded' | 'missing_or_invalid';
};

export type YandexRaspRuntimeProviderOptions = {
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  readText?: (path: string) => Promise<string>;
};

function credentialStatus(env: Readonly<Record<string, string | undefined>>): 'configured' | 'not configured' {
  const key = env.YANDEX_RASP_API_KEY ?? '';
  return /^[A-Za-z0-9._-]{8,512}$/.test(key) ? 'configured' : 'not configured';
}

function disabledForBindings(
  env: Readonly<Record<string, string | undefined>>,
  bindingEnvironment: YandexRaspBindingEnvironment,
): YandexRaspRuntimeProviderState {
  return {
    status: 'disabled',
    provider: null,
    credentialStatus: credentialStatus(env),
    blockers: ['trusted_bindings_unavailable'],
    attribution: YANDEX_LIVE_ATTRIBUTION,
    bindingEnvironment,
    bindingStatus: 'missing_or_invalid',
  };
}

/**
 * Runtime composition stays fail-closed. Production never falls back to the reviewed
 * development manifest; a dedicated production manifest must exist and pass the strict
 * parser before the normalized provider can be constructed.
 */
export async function loadYandexRaspRuntimeProvider(options: YandexRaspRuntimeProviderOptions = {}): Promise<YandexRaspRuntimeProviderState> {
  const env = options.env ?? process.env;
  const bindingEnvironment: YandexRaspBindingEnvironment = env.NODE_ENV === 'production' ? 'production' : 'development';
  const relativePath = bindingEnvironment === 'production' ? PRODUCTION_BINDINGS_PATH : DEVELOPMENT_BINDINGS_PATH;
  const path = resolve(options.cwd ?? process.cwd(), relativePath);
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, 'utf8'));

  let bindings;
  try {
    const parsed = JSON.parse(await readText(path)) as unknown;
    bindings = parseYandexRaspTrustedBindingsManifest(parsed, bindingEnvironment);
    if (bindings.size < 1) return disabledForBindings(env, bindingEnvironment);
  } catch {
    return disabledForBindings(env, bindingEnvironment);
  }

  const state = createYandexRaspNormalizedProvider({
    env,
    bindings,
    ...(options.now ? { now: options.now } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  return {
    ...state,
    bindingEnvironment,
    bindingStatus: 'loaded',
  };
}
