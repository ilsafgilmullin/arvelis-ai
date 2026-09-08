import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_URL = 'http://127.0.0.1:3000';
const DEBUG_URL = 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome/Chromium executable is unavailable on this runner.');
}

async function waitForHttp(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : 'unavailable'}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.runtimeErrors = [];
  }

  async connect() {
    assert.equal(typeof WebSocket, 'function', 'Node runtime must expose WebSocket for CDP acceptance smoke');
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), 5_000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP WebSocket connection failed')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.runtimeErrors.push(message.params?.exceptionDetails?.text ?? 'Runtime exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const values = (message.params.args ?? []).map((item) => item.value ?? item.description ?? '').filter(Boolean);
        this.runtimeErrors.push(`console.error: ${values.join(' ')}`);
      }
    });
  }

  send(method, params = {}) {
    assert.ok(this.socket && this.socket.readyState === WebSocket.OPEN, 'CDP socket is not open');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text ?? expression}`);
    return result.result?.value;
  }

  close() { this.socket?.close(); }
}

async function waitFor(client, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for browser state: ${label}`);
}

async function setViewport(client, viewport) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile, maxTouchPoints: viewport.mobile ? 5 : 1 });
  await sleep(80);
}

async function setControlValue(client, selector, value, index = 0) {
  const changed = await client.evaluate(`(() => {
    const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `Unable to set control: ${selector}[${index}]`);
}

async function clickVisibleButton(client, text, root = 'document') {
  const clicked = await client.evaluate(`(() => {
    const root = ${root === 'document' ? 'document' : `document.querySelector(${JSON.stringify(root)})`};
    if (!root) return false;
    const target = [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.trim() === ${JSON.stringify(text)} && button.getClientRects().length > 0 && !button.disabled
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Visible button not found: ${text} in ${root}`);
}

async function clickByAriaLabel(client, label) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)});
    if (!(button instanceof HTMLButtonElement) || button.disabled || button.getClientRects().length === 0) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Button not found by aria-label: ${label}`);
}

async function openDrawer(client) {
  await clickByAriaLabel(client, 'Открыть меню');
  await waitFor(client, "Boolean(document.querySelector('.travel-drawer'))", 'drawer open');
}

async function navigateDrawer(client, label) {
  await openDrawer(client);
  await clickVisibleButton(client, label, '.travel-drawer');
  await waitFor(client, "!document.querySelector('.travel-drawer')", `drawer close after ${label}`);
  await sleep(60);
}

async function assertLayout(client, viewportName) {
  const result = await client.evaluate(`(() => {
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const maxScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const controls = [...document.querySelectorAll('button, input:not([type="checkbox"]), textarea, summary, a[href]')]
      .filter(visible)
      .map((el) => ({
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60),
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
      }))
      .filter((item) => item.height < 43.5 || item.width < 43.5);
    const app = document.querySelector('.travel-app');
    return { innerWidth, maxScrollWidth, controls, overflowX: app ? getComputedStyle(app).overflowX : '' };
  })()`);
  assert.ok(result.maxScrollWidth <= result.innerWidth + 1, `${viewportName}: horizontal page overflow ${result.maxScrollWidth} > ${result.innerWidth}`);
  assert.equal(result.overflowX, 'clip', `${viewportName}: Travel root overflow-x hardening inactive`);
  assert.deepEqual(result.controls, [], `${viewportName}: interactive controls below 44px`);
}

async function assertFocusedVisible(client, selector, viewportName) {
  const result = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return null;
    element.focus();
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    return { active: document.activeElement === element, top: rect.top, bottom: rect.bottom, height: rect.height, innerHeight };
  })()`);
  assert.ok(result?.active, `${viewportName}: focused control unavailable: ${selector}`);
  assert.ok(result.top >= -1 && result.bottom <= result.innerHeight + 1, `${viewportName}: focused control outside viewport: ${selector}`);
  assert.ok(result.height >= 43.5, `${viewportName}: focused control below 44px: ${selector}`);
}

async function assertDrawerA11yAndScroll(client) {
  const scrollBefore = await client.evaluate(`(() => {
    window.scrollTo({ top: Math.min(260, document.documentElement.scrollHeight - innerHeight), behavior: 'auto' });
    return window.scrollY;
  })()`);
  await sleep(80);
  await openDrawer(client);
  const opened = await client.evaluate(`(() => ({
    overflow: document.body.style.overflow,
    activeInside: Boolean(document.activeElement?.closest('.travel-drawer')),
    expanded: document.querySelector('button[aria-label="Открыть меню"]')?.getAttribute('aria-expanded'),
    width: document.querySelector('.travel-drawer')?.getBoundingClientRect().width ?? 0,
  }))()`);
  assert.equal(opened.overflow, 'hidden', 'Drawer must lock body scroll');
  assert.equal(opened.activeInside, true, 'Drawer must move focus inside');
  assert.equal(opened.expanded, 'true');
  assert.ok(opened.width <= 340.5, `Drawer width too large: ${opened.width}`);

  const trap = await client.evaluate(`(() => {
    const drawer = document.querySelector('.travel-drawer');
    const items = [...drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    const first = items[0]; const last = items[items.length - 1];
    if (!first || !last) return false;
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    return document.activeElement === first;
  })()`);
  assert.equal(trap, true, 'Drawer focus trap failed');

  await client.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(client, "!document.querySelector('.travel-drawer')", 'drawer Escape close');
  await sleep(100);
  const closed = await client.evaluate(`(() => ({
    overflow: document.body.style.overflow,
    focusReturned: document.activeElement === document.querySelector('button[aria-label="Открыть меню"]'),
    scrollY: window.scrollY,
  }))()`);
  assert.notEqual(closed.overflow, 'hidden');
  assert.equal(closed.focusReturned, true, 'Drawer must restore focus');
  assert.ok(Math.abs(closed.scrollY - scrollBefore) <= 2, `Drawer close must preserve underlying scroll (${scrollBefore} -> ${closed.scrollY})`);

  await openDrawer(client);
  await client.evaluate(`(() => {
    const overlay = document.querySelector('.travel-drawer-overlay');
    overlay?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  await waitFor(client, "!document.querySelector('.travel-drawer')", 'drawer overlay close');
}

async function assertScreenScrollReset(client, label) {
  await client.evaluate("window.scrollTo({ top: 280, behavior: 'auto' })");
  await sleep(50);
  await navigateDrawer(client, label);
  await sleep(80);
  const y = await client.evaluate('window.scrollY');
  assert.ok(y <= 2, `${label}: new screen must reset scroll, got ${y}`);
}

async function assertNoDeveloperCopy(client, screenName) {
  const forbidden = ['TRIP WORKSPACE', 'Travel preferences', 'AI Gateway', 'AI-провайдер', 'account-контур', 'Travel Assistant', 'Travel Legal'];
  const text = await client.evaluate('document.body.innerText');
  for (const term of forbidden) assert.ok(!text.includes(term), `${screenName}: user-facing developer term remains: ${term}`);
}

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), 'arvelis-v2-polish-'));
let vite;
let chromeProcess;
let client;
let viteLog = '';
let chromeLog = '';

try {
  vite = spawn('npm', ['run', 'dev'], { env: { ...process.env, VITE_REAL_AUTH_ENABLED: 'false', VITE_SHOW_DIAGNOSTICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });
  await waitForHttp(APP_URL);

  chromeProcess = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9222', `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chromeProcess.stdout.on('data', (chunk) => { chromeLog += chunk.toString(); });
  chromeProcess.stderr.on('data', (chunk) => { chromeLog += chunk.toString(); });
  await waitForHttp(`${DEBUG_URL}/json/version`);

  const pageResponse = await fetch(`${DEBUG_URL}/json/new?about:blank`, { method: 'PUT' });
  assert.ok(pageResponse.ok, `Unable to create Chrome acceptance page: ${pageResponse.status}`);
  const page = await pageResponse.json();
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  await setViewport(client, { name: '390x844', width: 390, height: 844, mobile: true });
  await client.send('Page.navigate', { url: APP_URL });
  await waitFor(client, "document.readyState === 'complete'", 'document ready');
  await waitFor(client, "Boolean(document.querySelector('#preview-profile-name')) || Boolean(document.querySelector('.travel-app'))", 'Auth or Travel app');
  if (await client.evaluate("Boolean(document.querySelector('#preview-profile-name'))")) {
    await setControlValue(client, '#preview-profile-name', 'Acceptance QA');
    await clickVisibleButton(client, 'Продолжить');
  }
  await waitFor(client, "Boolean(document.querySelector('.travel-app'))", 'Travel app');
  await waitFor(client, "document.body.textContent.includes('Куда отправимся?')", 'AI-first Home');
  await assertLayout(client, '390x844 Home');
  await assertNoDeveloperCopy(client, 'Home');
  await assertDrawerA11yAndScroll(client);

  await assertScreenScrollReset(client, 'ARVELIS AI');
  await waitFor(client, "document.querySelector('.travel-assistant')?.dataset.assistantScope === 'general'", 'general assistant');
  assert.equal(await client.evaluate("document.body.textContent.includes('Чем помочь с путешествием?')"), true);
  assert.equal(await client.evaluate("document.body.textContent.includes('Создать поездку') && document.body.textContent.includes('Мои поездки')"), true, 'General AI quick actions missing');
  await setControlValue(client, '#travel-assistant-prompt', 'Куда поехать на море в октябре?');
  await clickByAriaLabel(client, 'Отправить запрос');
  await waitFor(client, "document.body.textContent.includes('Куда поехать на море в октябре?')", 'local user message');
  assert.equal(await client.evaluate("document.querySelector('#travel-assistant-prompt')?.value === ''"), true, 'Assistant composer must clear after accepted local message');
  assert.equal(await client.evaluate("document.body.textContent.includes('AI-планирование пока не подключено.')"), true, 'Truthful AI unavailable notice missing');
  await assertNoDeveloperCopy(client, 'General assistant');

  await navigateDrawer(client, 'Профиль');
  await waitFor(client, "Boolean(document.querySelector('.travel-profile__menu'))", 'Profile menu');
  for (const label of ['Личные данные', 'Настройки поездок', 'Мои документы', 'Уведомления', 'Безопасность', 'Конфиденциальность', 'Помощь', 'О приложении']) {
    assert.equal(await client.evaluate(`document.body.textContent.includes(${JSON.stringify(label)})`), true, `Profile row missing: ${label}`);
  }
  await assertNoDeveloperCopy(client, 'Profile');
  await navigateDrawer(client, 'Настройки');
  await waitFor(client, "document.querySelector('.travel-settings h1')?.textContent === 'Настройки'", 'Settings');
  assert.equal(await client.evaluate("document.body.textContent.includes('Настройки поездок') && document.body.textContent.includes('Конфиденциальность') && document.body.textContent.includes('Безопасность')"), true);
  assert.equal(await client.evaluate("!document.body.textContent.includes('Открыть диагностику')"), true, 'Diagnostics must stay hidden without explicit debug flag');
  await assertNoDeveloperCopy(client, 'Settings');

  await navigateDrawer(client, 'Создать поездку');
  await waitFor(client, "document.body.textContent.includes('ШАГ 1 ИЗ 3')", 'Create Trip step 1');
  await setControlValue(client, 'input[placeholder="Например, Казань"]', 'Казань');
  await setControlValue(client, 'input[placeholder="Страна или город"]', 'Рим');
  await setControlValue(client, 'input[type="date"]', '2026-09-25', 0);
  await setControlValue(client, 'input[type="date"]', '2026-09-30', 1);
  await waitFor(client, "document.body.textContent.includes('5 ночей') && document.body.textContent.includes('6 дней')", 'derived exact-date duration');
  assert.equal(await client.evaluate("!document.body.textContent.includes('Количество дней')"), true, 'Exact-date UI must not expose editable day count');
  await clickVisibleButton(client, 'Продолжить');
  await waitFor(client, "document.body.textContent.includes('ШАГ 2 ИЗ 3')", 'Create Trip step 2');
  await clickByAriaLabel(client, 'Увеличить: Количество путешественников');
  await waitFor(client, "document.body.textContent.includes('3 путешественника')", 'traveler stepper');
  await setControlValue(client, '.travel-money-input input', '000500000');
  await waitFor(client, "document.querySelector('.travel-money-input input')?.value.replace(/\\D/g, '') === '500000'", 'budget numeric normalization');
  assert.equal(await client.evaluate("!document.querySelector('.travel-money-input input')?.value.trim().startsWith('0')"), true, 'Budget presentation must remove leading zeroes');
  await clickVisibleButton(client, 'Продолжить');
  await waitFor(client, "document.body.textContent.includes('ШАГ 3 ИЗ 3')", 'Create Trip step 3');
  await clickVisibleButton(client, 'Море');
  await clickVisibleButton(client, 'Минимум пересадок');
  await setControlValue(client, 'textarea[placeholder*="сложных пересадок"]', 'Без сложных пересадок');
  await clickVisibleButton(client, 'Создать поездку');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'saved trip');
  assert.equal(await client.evaluate("document.body.textContent.includes('Рим') && document.body.textContent.includes('5 ночей') && document.body.textContent.includes('6 дней')"), true, 'Saved exact-date summary missing');
  assert.equal(await client.evaluate("document.body.textContent.includes('3 путешественника') && document.body.textContent.includes('500')"), true, 'Saved traveler/budget summary missing');
  await assertNoDeveloperCopy(client, 'Trip');

  await clickVisibleButton(client, '← Мои поездки');
  await waitFor(client, "Boolean(document.querySelector('.travel-trip-card'))", 'trip card');
  assert.equal(await client.evaluate(`(() => { const card = document.querySelector('.travel-trip-card'); if (!card) return false; card.click(); return true; })()`), true);
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'reopened trip');
  assert.equal(await client.evaluate("document.body.textContent.includes('Рим') && document.body.textContent.includes('500')"), true, 'Reopened trip lost normalized data');

  await clickVisibleButton(client, 'Спросить ARVELIS');
  await waitFor(client, "document.querySelector('.travel-assistant')?.dataset.assistantScope === 'trip'", 'trip assistant');
  assert.equal(await client.evaluate("document.body.textContent.includes('Вернуться к поездке')"), true);
  assert.equal(await client.evaluate("!document.body.textContent.includes('Создать поездку')"), true, 'Trip assistant must not offer creating a new trip');
  await setControlValue(client, '#travel-assistant-prompt', 'Что проверить перед поездкой?');
  await clickByAriaLabel(client, 'Отправить запрос');
  assert.equal(await client.evaluate("document.querySelector('#travel-assistant-prompt')?.value === ''"), true, 'Trip assistant composer must clear');
  await clickVisibleButton(client, 'Вернуться к поездке');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'return to trip');

  const states = [
    ['Маршрут', 'Маршрут пока не добавлен'],
    ['Карта', 'Карта маршрута'],
    ['Бюджет', 'Расходы пока не добавлены.'],
    ['Документы', 'Документы поездки'],
    ['Правила', 'Проверка ещё не выполнена'],
    ['Книга поездки', 'Экспорт книги поездки появится позже.'],
  ];
  for (const [tab, expected] of states) {
    await clickVisibleButton(client, tab, '.travel-tabs');
    await waitFor(client, `document.body.textContent.includes(${JSON.stringify(expected)})`, `${tab} truthful state`);
  }

  const services = [
    ['Маршруты', 'Здесь ARVELIS будет сравнивать самолёты, поезда, автобусы и смешанные варианты.', 'is-route'],
    ['Документы', 'Документы поездки', 'is-document'],
    ['Юридическая проверка', 'Проверка документов и правил', 'is-shield'],
    ['Карта', 'Карта маршрута', 'is-map'],
  ];
  for (const [nav, expected, iconClass] of services) {
    await navigateDrawer(client, nav);
    await waitFor(client, `document.body.textContent.includes(${JSON.stringify(expected)})`, `${nav} service`);
    assert.equal(await client.evaluate(`Boolean(document.querySelector('.travel-service-foundation__icon.${iconClass}'))`), true, `${nav}: unique service icon missing`);
  }

  const viewports = [
    { name: '390x844', width: 390, height: 844, mobile: true },
    { name: '844x390', width: 844, height: 390, mobile: true },
    { name: '360x800', width: 360, height: 800, mobile: true },
    { name: '1440x900', width: 1440, height: 900, mobile: false },
  ];

  for (const viewport of viewports) {
    await setViewport(client, viewport);
    await navigateDrawer(client, 'Главная');
    await waitFor(client, "document.body.textContent.includes('Куда отправимся?')", `${viewport.name} Home`);
    await assertLayout(client, `${viewport.name} Home`);
    await assertFocusedVisible(client, '#travel-home-prompt', `${viewport.name} Home composer`);
    const promptState = await client.evaluate(`(() => {
      const group = document.querySelector('.travel-starter-prompts');
      const buttons = group ? [...group.querySelectorAll('button')] : [];
      return { clipped: buttons.some((button) => button.scrollWidth > button.clientWidth + 1) };
    })()`);
    assert.equal(promptState.clipped, false, `${viewport.name}: starter prompt text clipped`);

    await openDrawer(client);
    await assertLayout(client, `${viewport.name} Drawer`);
    await client.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor(client, "!document.querySelector('.travel-drawer')", `${viewport.name} drawer close`);

    await navigateDrawer(client, 'Мои поездки');
    await waitFor(client, "Boolean(document.querySelector('.travel-trip-card'))", `${viewport.name} trip card`);
    assert.equal(await client.evaluate(`(() => { const card = document.querySelector('.travel-trip-card'); if (!card) return false; card.click(); return true; })()`), true);
    await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", `${viewport.name} trip`);
    await assertLayout(client, `${viewport.name} Trip`);
    const tabs = await client.evaluate(`(() => { const el = document.querySelector('.travel-tabs'); return { exists: Boolean(el), overflowX: el ? getComputedStyle(el).overflowX : '' }; })()`);
    assert.equal(tabs.exists, true, `${viewport.name}: tabs missing`);
    assert.equal(tabs.overflowX, 'auto', `${viewport.name}: trip tabs must scroll internally`);
  }

  assert.deepEqual(client.runtimeErrors, [], `Browser runtime errors: ${client.runtimeErrors.join(' | ')}`);
  console.log('travel browser acceptance: PASS (V2 iPhone polish: 390x844, 844x390, 360x800, 1440x900)');
} catch (error) {
  if (viteLog) console.error(`\n--- Vite output ---\n${viteLog.slice(-8000)}`);
  if (chromeLog) console.error(`\n--- Chrome output ---\n${chromeLog.slice(-8000)}`);
  throw error;
} finally {
  client?.close();
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill('SIGTERM');
  if (vite && !vite.killed) vite.kill('SIGTERM');
  await sleep(120);
  await rm(userDataDir, { recursive: true, force: true });
}
