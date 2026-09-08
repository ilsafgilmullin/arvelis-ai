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
  await sleep(100);
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

async function openDrawer(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Открыть меню"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, 'Menu button not found');
  await waitFor(client, "Boolean(document.querySelector('.travel-drawer'))", 'drawer open');
}

async function navigateDrawer(client, label) {
  await openDrawer(client);
  await clickVisibleButton(client, label, '.travel-drawer');
  await waitFor(client, "!document.querySelector('.travel-drawer')", `drawer close after ${label}`);
}

async function assertDrawerBehavior(client) {
  await openDrawer(client);
  const opened = await client.evaluate(`(() => ({
    overflow: document.body.style.overflow,
    activeInside: Boolean(document.activeElement?.closest('.travel-drawer')),
    expanded: document.querySelector('button[aria-label="Открыть меню"]')?.getAttribute('aria-expanded'),
    animationDuration: getComputedStyle(document.querySelector('.travel-drawer')).animationDuration,
  }))()`);
  assert.equal(opened.overflow, 'hidden', 'Drawer must lock body scroll');
  assert.equal(opened.activeInside, true, 'Drawer must move focus inside');
  assert.equal(opened.expanded, 'true', 'Menu button aria-expanded must be true while open');
  assert.ok(Number.parseFloat(opened.animationDuration) <= 0.01, `Reduced motion must suppress drawer animation: ${opened.animationDuration}`);

  const trapForward = await client.evaluate(`(() => {
    const drawer = document.querySelector('.travel-drawer');
    const items = [...drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    const first = items[0]; const last = items[items.length - 1];
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    return document.activeElement === first;
  })()`);
  assert.equal(trapForward, true, 'Drawer forward focus trap failed');

  const trapBackward = await client.evaluate(`(() => {
    const drawer = document.querySelector('.travel-drawer');
    const items = [...drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.getClientRects().length > 0);
    const first = items[0]; const last = items[items.length - 1];
    first.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    return document.activeElement === last;
  })()`);
  assert.equal(trapBackward, true, 'Drawer backward focus trap failed');

  await client.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(client, "!document.querySelector('.travel-drawer')", 'drawer Escape close');
  const escaped = await client.evaluate(`(() => ({
    overflowRestored: document.body.style.overflow !== 'hidden',
    focusReturned: document.activeElement === document.querySelector('button[aria-label="Открыть меню"]'),
    expanded: document.querySelector('button[aria-label="Открыть меню"]')?.getAttribute('aria-expanded'),
  }))()`);
  assert.equal(escaped.overflowRestored, true, 'Body scroll must restore after Escape');
  assert.equal(escaped.focusReturned, true, 'Focus must return to menu button after Escape');
  assert.equal(escaped.expanded, 'false');

  await openDrawer(client);
  await client.evaluate(`(() => {
    const overlay = document.querySelector('.travel-drawer-overlay');
    overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  })()`);
  await waitFor(client, "!document.querySelector('.travel-drawer')", 'drawer overlay dismiss');
  assert.equal(await client.evaluate("document.body.style.overflow !== 'hidden'"), true, 'Body scroll must restore after overlay dismiss');
}

async function assertLayout(client, viewportName) {
  const result = await client.evaluate(`(() => {
    const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const maxScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const controls = [...document.querySelectorAll('button, input:not([type="checkbox"]), textarea, summary, a[href]')]
      .filter(visible)
      .map((el) => ({ tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 50), height: el.getBoundingClientRect().height }))
      .filter((item) => item.height < 43.5);
    const app = document.querySelector('.travel-app');
    return { innerWidth, innerHeight, maxScrollWidth, controls, overflowX: app ? getComputedStyle(app).overflowX : '' };
  })()`);
  assert.ok(result.maxScrollWidth <= result.innerWidth + 1, `${viewportName}: horizontal page overflow ${result.maxScrollWidth} > ${result.innerWidth}`);
  assert.equal(result.overflowX, 'clip', `${viewportName}: Travel root overflow-x hardening inactive`);
  assert.deepEqual(result.controls, [], `${viewportName}: interactive controls below 44px`);
}

async function assertFocusedControlVisible(client, viewportName) {
  const state = await client.evaluate(`(() => {
    const control = document.querySelector('input:not([disabled]):not([type="checkbox"]), textarea:not([disabled]), button:not([disabled])');
    if (!control) return null;
    control.focus();
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = control.getBoundingClientRect();
    return { active: document.activeElement === control, top: rect.top, bottom: rect.bottom, innerHeight };
  })()`);
  assert.ok(state?.active, `${viewportName}: focusable control could not receive focus`);
  assert.ok(state.top >= -1 && state.bottom <= state.innerHeight + 1, `${viewportName}: focused control outside viewport`);
}

async function assertWorkspaceTabs(client, viewportName) {
  const state = await client.evaluate(`(() => {
    const tabs = document.querySelector('.travel-tabs');
    const active = tabs?.querySelector('[role="tab"][aria-selected="true"]');
    return {
      exists: Boolean(tabs),
      overflowX: tabs ? getComputedStyle(tabs).overflowX : '',
      active: Boolean(active),
      scrollWidth: tabs?.scrollWidth ?? 0,
      clientWidth: tabs?.clientWidth ?? 0,
    };
  })()`);
  assert.equal(state.exists, true, `${viewportName}: workspace tabs missing`);
  assert.equal(state.overflowX, 'auto', `${viewportName}: workspace tabs must scroll internally`);
  assert.equal(state.active, true, `${viewportName}: active workspace tab missing`);
  assert.ok(state.scrollWidth >= state.clientWidth, `${viewportName}: invalid workspace tab geometry`);
}

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), 'arvelis-v2-chrome-'));
let vite;
let chromeProcess;
let client;
let viteLog = '';
let chromeLog = '';

try {
  vite = spawn('npm', ['run', 'dev'], { env: { ...process.env, VITE_REAL_AUTH_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const needsPreviewProfile = await client.evaluate("Boolean(document.querySelector('#preview-profile-name'))");
  if (needsPreviewProfile) {
    await setControlValue(client, '#preview-profile-name', 'Acceptance QA');
    await clickVisibleButton(client, 'Продолжить');
  }
  await waitFor(client, "Boolean(document.querySelector('.travel-app'))", 'Travel app');
  await waitFor(client, "document.body.textContent.includes('Куда отправимся?')", 'AI-first Home');
  await assertLayout(client, '390x844 Home');
  await assertDrawerBehavior(client);

  // General ARVELIS AI: no fake response.
  await navigateDrawer(client, 'ARVELIS AI');
  await waitFor(client, "document.querySelector('.travel-assistant')?.dataset.assistantScope === 'general'", 'general assistant context');
  await setControlValue(client, '#travel-assistant-prompt', 'Куда поехать на море в октябре?');
  await client.evaluate("document.querySelector('button[aria-label=\"Отправить запрос\"]')?.click()");
  await waitFor(client, "document.body.textContent.includes('ARVELIS AI пока не подключён')", 'general truthful AI unavailable');
  assert.equal(await client.evaluate("!document.body.textContent.includes('MOCK')"), true, 'General assistant must not show mock output');

  // My Trips -> Create -> save -> reopen.
  await navigateDrawer(client, 'Мои поездки');
  await waitFor(client, "document.body.textContent.includes('Мои поездки')", 'My Trips');
  await navigateDrawer(client, 'Создать поездку');
  await waitFor(client, "document.querySelector('.travel-create h1')?.textContent?.trim() === 'Создать поездку'", 'Create Trip');
  await setControlValue(client, 'input[placeholder="Например, Казань"]', 'Казань');
  await setControlValue(client, 'input[placeholder="Страна или город"]', 'Сочи');
  await setControlValue(client, 'input[type="date"]', '2026-10-01', 0);
  await setControlValue(client, 'input[type="date"]', '2026-10-08', 1);
  await setControlValue(client, 'textarea[placeholder*="пересадок"]', 'Без сложных пересадок');
  await clickVisibleButton(client, 'Море');
  await clickVisibleButton(client, 'Минимум пересадок');
  await clickVisibleButton(client, 'Сохранить поездку');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'saved Trip Workspace');
  assert.ok(await client.evaluate("document.body.textContent.includes('Сочи')"), 'Saved Trip destination missing');

  await clickVisibleButton(client, '← Мои поездки');
  await waitFor(client, "Boolean(document.querySelector('.travel-trip-card'))", 'saved trip card');
  assert.equal(await client.evaluate(`(() => { const card = document.querySelector('.travel-trip-card'); if (!card) return false; card.click(); return true; })()`), true, 'Unable to reopen saved Trip');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'reopened Trip Workspace');

  // Trip-scoped AI.
  await clickVisibleButton(client, 'Спросить ARVELIS');
  await waitFor(client, "document.querySelector('.travel-assistant')?.dataset.assistantScope === 'trip'", 'trip assistant context');
  await waitFor(client, "document.body.textContent.includes('ARVELIS AI пока не подключён')", 'trip truthful AI unavailable');
  assert.equal(await client.evaluate("!document.body.textContent.includes('MOCK')"), true, 'Trip assistant must not show mock output');
  await clickVisibleButton(client, 'Вернуться к поездке');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'return to Trip');

  const truthStates = [
    ['Маршрут', 'Маршрут по дням пока пуст'],
    ['Карта', 'Карта будет доступна после подключения картографического сервиса.'],
    ['Бюджет', 'Цены и расходы не рассчитаны'],
    ['Документы', 'Документы не добавлены'],
    ['Legal', 'Юридическая проверка ещё не выполнялась.'],
    ['Trip Book', 'PDF-генерация пока не подключена'],
  ];
  for (const [tab, expected] of truthStates) {
    await clickVisibleButton(client, tab, '.travel-tabs');
    await waitFor(client, `document.body.textContent.includes(${JSON.stringify(expected)})`, `${tab} truthful state`);
  }

  await navigateDrawer(client, 'Профиль');
  await waitFor(client, "Boolean(document.querySelector('.travel-profile'))", 'Profile');
  assert.equal(await client.evaluate("!document.body.textContent.includes('Диагностика preview')"), true, 'Technical diagnostics must not dominate Profile');

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
    await assertFocusedControlVisible(client, `${viewport.name} Home`);

    await openDrawer(client);
    await assertLayout(client, `${viewport.name} drawer`);
    await client.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor(client, "!document.querySelector('.travel-drawer')", `${viewport.name} drawer close`);

    await navigateDrawer(client, 'Мои поездки');
    await waitFor(client, "Boolean(document.querySelector('.travel-trip-card'))", `${viewport.name} trip card`);
    assert.equal(await client.evaluate(`(() => { const card = document.querySelector('.travel-trip-card'); if (!card) return false; card.click(); return true; })()`), true, `${viewport.name}: unable to open Trip`);
    await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", `${viewport.name} Trip Workspace`);
    await assertLayout(client, `${viewport.name} Trip Workspace`);
    await assertWorkspaceTabs(client, viewport.name);
    await assertFocusedControlVisible(client, `${viewport.name} Trip Workspace`);
  }

  assert.deepEqual(client.runtimeErrors, [], `Browser runtime errors: ${client.runtimeErrors.join(' | ')}`);
  console.log('travel browser acceptance: PASS (V2 Chromium: 390x844, 844x390, 360x800, 1440x900)');
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
