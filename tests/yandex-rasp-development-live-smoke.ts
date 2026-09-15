import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { YandexRaspHttpClient, YandexRaspHttpError } from '../server/travel/providers/yandexRaspHttpClient';
import { mapYandexSearchRequest } from '../server/travel/providers/yandexRaspSearchMapping';
import { validateYandexSearchPage } from '../server/travel/providers/yandexRaspResponseValidation';
import { parseYandexRaspTrustedBindingsManifest } from '../server/travel/providers/yandexRaspTrustedBindings';
import { transportLocalDate, type TransportSearchRequestV1 } from '../src/travel/transportSearchRequest';

const ORIGIN_ID = 'arvelis:dev:station:moscow-kazansky';
const DESTINATION_ID = 'arvelis:dev:station:kazan-pass';

function plusDays(dateOnly: string, days: number): string {
  const value = new Date(`${dateOnly}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development Yandex smoke must not run in production.');
  if (process.env.ARVELIS_YANDEX_DEV_SMOKE_APPROVED !== 'true') {
    throw new Error('Set ARVELIS_YANDEX_DEV_SMOKE_APPROVED=true only for the explicit development smoke run.');
  }
  if (process.env.YANDEX_RASP_NETWORK_ENABLED === 'true') {
    throw new Error('Application provider network gate must remain disabled during the isolated development smoke.');
  }

  const apiKey = process.env.YANDEX_RASP_API_KEY ?? '';
  if (!/^[A-Za-z0-9._-]{8,512}$/.test(apiKey)) throw new Error('YANDEX_RASP_API_KEY is not configured as a protected development secret.');

  const manifestRaw = await readFile('config/yandex-rasp-development-bindings.v1.json', 'utf8');
  const manifest = JSON.parse(manifestRaw) as unknown;
  const bindings = parseYandexRaspTrustedBindingsManifest(manifest, 'development');
  assert.equal(bindings.get(ORIGIN_ID)?.searchCode, 's2000003');
  assert.equal(bindings.get(DESTINATION_ID)?.searchCode, 's9623141');

  const now = new Date();
  const departureDate = plusDays(transportLocalDate(now, 'Europe/Moscow'), 7);
  const request: TransportSearchRequestV1 = {
    version: 1,
    origin: {
      rawLabel: 'Казанский вокзал (Москва)',
      type: 'station',
      resolution: 'resolved',
      displayName: 'Казанский вокзал (Москва)',
      locationId: ORIGIN_ID,
      countryCode: 'RU',
    },
    destination: {
      rawLabel: 'Казань-Пасс.',
      type: 'station',
      resolution: 'resolved',
      displayName: 'Казань-Пасс.',
      locationId: DESTINATION_ID,
      countryCode: 'RU',
    },
    departureDate,
    passengers: { adults: 1 },
    allowedModes: ['train'],
    preferredMode: 'train',
    locale: 'ru-RU',
    timezone: 'Europe/Moscow',
    constraints: { maxTransfers: 0 },
  };

  const client = new YandexRaspHttpClient({ apiKey, timeoutMs: 10_000 });
  const controller = new AbortController();

  const copyright = await client.getCopyright(controller.signal);
  assert.equal(copyright.bannerMarkupPresent, true);
  assert.equal(copyright.url, 'https://rasp.yandex.ru/');
  assert.ok(copyright.text.includes('Яндекс'));

  const mapped = mapYandexSearchRequest(request, bindings, now);
  assert.equal(mapped.length, 1);
  const search = mapped[0]!;
  search.params.set('limit', '10');
  search.params.set('offset', '0');

  const response = await client.searchPage(search, controller.signal);
  const page = validateYandexSearchPage(response.body, search);

  const sanitized = {
    status: 'LIVE_PROVIDER_SMOKE_OK',
    provider: 'yandex-rasp-v3',
    credentialConfigured: true,
    applicationNetworkGateEnabled: false,
    requestsIssued: 2,
    attribution: {
      text: copyright.text,
      url: copyright.url,
      bannerMarkupPresent: copyright.bannerMarkupPresent,
    },
    search: {
      from: search.params.get('from'),
      to: search.params.get('to'),
      date: search.params.get('date'),
      mode: search.params.get('transport_types'),
      total: page.pagination.total,
      returned: page.segments.length,
      intervalServices: page.intervalCount,
    },
    timing: {
      searchNetworkMs: Math.round(response.timing.networkMs),
      searchParseMs: Math.round(response.timing.parseMs),
    },
  };

  const serialized = JSON.stringify(sanitized, null, 2);
  assert.equal(serialized.includes(apiKey), false);
  console.log(serialized);
}

main().catch((error: unknown) => {
  const safe = error instanceof YandexRaspHttpError
    ? { name: error.name, code: error.code, status: error.status ?? null }
    : { name: error instanceof Error ? error.name : 'Error', code: 'development_smoke_failed', status: null };
  console.error(JSON.stringify({ status: 'LIVE_PROVIDER_SMOKE_FAILED', error: safe }, null, 2));
  process.exitCode = 1;
});
