import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/travel/TransportProviderAttribution.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/travel/travel-provider-attribution.css', import.meta.url), 'utf8');
const results = await readFile(new URL('../src/travel/TransportResultsScreen.tsx', import.meta.url), 'utf8');
const resultsCss = await readFile(new URL('../src/travel/travel-transport-results.css', import.meta.url), 'utf8');
const routes = await readFile(new URL('../src/travel/RoutesScreen.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/travel/TravelApp.tsx', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');

assert.ok(component.includes("export const YANDEX_RASP_COPYRIGHT_BANNER_URL = 'https://yandex.st/rasp/media/apicc/copyright_vert_mono.html'"));
assert.ok(component.includes('export function YandexRaspCopyrightBanner()'));
assert.ok(component.includes('export function YandexRaspProviderAttribution'));
assert.ok(component.includes('sandbox=""'));
assert.ok(component.includes('referrerPolicy="no-referrer"'));
assert.ok(component.includes('loading="lazy"'));
assert.ok(component.includes('tabIndex={-1}'));
assert.ok(component.includes("attribution.providerName === 'Яндекс Расписания'"));
assert.ok(component.includes("attribution.url === 'https://rasp.yandex.ru/'"));
assert.ok(component.includes('&& attribution.bannerRequired'));
assert.ok(component.includes('data-banner-state={bannerState}'));
assert.ok(component.includes("data-link-state={href ? 'ready' : 'invalid'}"));
assert.equal(component.includes('dangerouslySetInnerHTML'), false);
assert.equal(component.includes('srcDoc='), false);
assert.equal(component.includes('<script'), false);

const bannerPosition = component.indexOf('travel-provider-attribution__banner');
const textPosition = component.indexOf('travel-provider-attribution__text');
const urlPosition = component.indexOf('travel-provider-attribution__url');
assert.ok(bannerPosition >= 0 && textPosition > bannerPosition && urlPosition > textPosition, 'Attribution order must stay banner -> text -> URL.');
assert.ok(component.includes('{attribution.text}</span>'));
assert.ok(component.includes('>{attribution.url}</a>'));

assert.ok(css.includes('.travel-provider-attribution__official-banner'));
assert.ok(css.includes('width: 240px'));
assert.ok(css.includes('max-width: 100%'));
assert.ok(css.includes('height: 130px'));
assert.ok(css.includes('overflow: hidden'));

// The results UI consumes only a normalized response. It does not call Yandex or read secrets.
assert.ok(results.includes('response: TransportSearchResponse | null'));
assert.ok(results.includes("response.providerId === 'yandex-rasp-v3'"));
assert.ok(results.includes('<YandexRaspProviderAttribution attribution={attribution} />'));
assert.ok(results.includes('<TransportProviderAttribution attribution={attribution} />'));
assert.ok(results.includes("response.metadata?.coverage.status === 'partial'"));
assert.ok(results.includes("policy.freshness === 'expired'"));
assert.ok(results.includes('policy.priceAuthoritative && route.price'));
assert.ok(results.includes('availabilityText(route, policy.availabilityAuthoritative)'));
assert.equal(results.includes('YANDEX_RASP_API_KEY'), false);
assert.equal(results.includes('fetch('), false);
assert.equal(results.includes('demo'), false);
assert.equal(results.includes('mock'), false);

const resultListPosition = results.indexOf('travel-transport-results__list');
const yandexAttributionPosition = results.indexOf('<YandexRaspProviderAttribution');
assert.ok(resultListPosition >= 0 && yandexAttributionPosition > resultListPosition, 'Provider attribution must remain directly after provider-backed result data.');

// Routes is now wired through the validated HTTP client. The app must not regress to the old truthful placeholder.
assert.ok(routes.includes("import { searchRoutesForTrip"));
assert.ok(routes.includes("state.status === 'ready'"));
assert.ok(routes.includes('response={state.response}'));
assert.ok(routes.includes("state.status === 'needs_disambiguation'"));
assert.ok(routes.includes("state.status === 'offline'"));
assert.ok(routes.includes("state.status === 'failed'"));
assert.equal(routes.includes('YANDEX_RASP_API_KEY'), false);
assert.ok(app.includes("import { RoutesScreen } from './RoutesScreen'"));
assert.ok(app.includes('<RoutesScreen'));
assert.ok(app.includes('trip={selectedTrip}'));
assert.ok(app.includes('online={online}'));
assert.equal(app.includes('<TransportResultsScreen response={null}'), false);
assert.ok(main.includes("./travel/travel-transport-results.css"));
assert.ok(resultsCss.includes('@media (max-width: 700px)'));
assert.ok(resultsCss.includes('@media (max-width: 390px)'));
assert.ok(resultsCss.includes('min-width: 0'));

console.log('Yandex Rasp attribution and normalized transport results UI safety contract: PASS');
