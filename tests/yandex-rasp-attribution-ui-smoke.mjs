import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/travel/TransportProviderAttribution.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/travel/travel-provider-attribution.css', import.meta.url), 'utf8');

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
assert.ok(component.includes("data-banner-state={bannerState}"));
assert.equal(component.includes('dangerouslySetInnerHTML'), false);
assert.equal(component.includes('srcDoc='), false);
assert.equal(component.includes('<script'), false);

assert.ok(css.includes('.travel-provider-attribution__official-banner'));
assert.ok(css.includes('width: 240px'));
assert.ok(css.includes('max-width: 100%'));
assert.ok(css.includes('height: 130px'));
assert.ok(css.includes('overflow: hidden'));

console.log('Yandex Rasp attribution UI safety contract: PASS');
