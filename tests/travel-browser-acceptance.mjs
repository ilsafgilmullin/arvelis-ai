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
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP WebSocket connection failed'));
      }, { once: true });
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
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text ?? expression}`);
    }
    return result.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitFor(client, expression, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for browser state: ${label}`);
}

async function clickButton(client, text) {
  const clicked = await client.evaluate(`(() => {
    const target = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.trim() === ${JSON.stringify(text)} && button.getClientRects().length > 0 && !button.disabled
    );
    if (!target) return false;
    target.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Visible button not found: ${text}`);
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

async function setViewport(client, viewport) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 3 : 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await client.send('Emulation.setTouchEmulationEnabled', {
    enabled: viewport.mobile,
    maxTouchPoints: viewport.mobile ? 5 : 1,
  });
  await sleep(80);
}

async function assertCreateLayout(client, viewportName) {
  await client.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await sleep(120);

  const layout = await client.evaluate(`(() => {
    const visible = (element) => element.getClientRects().length > 0;
    const selectors = [
      '.travel-toggle', '.travel-check', '.travel-primary', '.travel-secondary',
      '.travel-link', '.travel-back', '.travel-brand-button', '.travel-bottom-nav button',
      '.travel-form input:not([type="checkbox"])', '.travel-form textarea'
    ];
    const targets = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const tooSmall = targets.filter(visible).map((element) => ({
      selector: element.className || element.tagName,
      text: element.textContent?.trim().slice(0, 40) ?? '',
      height: element.getBoundingClientRect().height,
    })).filter((item) => item.height < 43.5);

    const nav = document.querySelector('.travel-bottom-nav')?.getBoundingClientRect();
    const actions = document.querySelector('.travel-form-actions')?.getBoundingClientRect();
    const actionsNavOverlap = Boolean(nav && actions && actions.bottom > nav.top && actions.top < nav.bottom);
    const maxScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);

    return {
      innerWidth,
      innerHeight,
      maxScrollWidth,
      overflowX: getComputedStyle(document.querySelector('.travel-app')).overflowX,
      tooSmall,
      actionsNavOverlap,
      navBottom: nav?.bottom ?? null,
      actionsBottom: actions?.bottom ?? null,
    };
  })()`);

  assert.ok(layout.maxScrollWidth <= layout.innerWidth + 1, `${viewportName}: page has horizontal overflow (${layout.maxScrollWidth} > ${layout.innerWidth})`);
  assert.equal(layout.overflowX, 'clip', `${viewportName}: Travel root overflow-x hardening is not active`);
  assert.deepEqual(layout.tooSmall, [], `${viewportName}: undersized interactive targets found`);
  assert.equal(layout.actionsNavOverlap, false, `${viewportName}: Create Trip actions overlap bottom navigation`);

  const focusState = await client.evaluate(`(() => {
    const input = document.querySelector('.travel-form input:not([type="checkbox"]):not(:disabled)');
    if (!(input instanceof HTMLInputElement)) return null;
    input.focus();
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = input.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, active: document.activeElement === input };
  })()`);
  await sleep(60);
  assert.ok(focusState?.active, `${viewportName}: form control could not receive focus`);
  assert.ok(focusState.top >= -1 && focusState.bottom <= layout.innerHeight + 1, `${viewportName}: focused form control is outside viewport`);
}

async function assertWorkspaceLayout(client, viewportName) {
  const layout = await client.evaluate(`(() => {
    const maxScrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const tabs = document.querySelector('.travel-tabs');
    const tooSmallTabs = [...document.querySelectorAll('.travel-tabs button')]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => ({ text: button.textContent?.trim() ?? '', height: button.getBoundingClientRect().height }))
      .filter((item) => item.height < 43.5);
    return {
      innerWidth,
      maxScrollWidth,
      tooSmallTabs,
      tabClientWidth: tabs?.clientWidth ?? 0,
      tabScrollWidth: tabs?.scrollWidth ?? 0,
      tabOverflowX: tabs ? getComputedStyle(tabs).overflowX : '',
    };
  })()`);

  assert.ok(layout.maxScrollWidth <= layout.innerWidth + 1, `${viewportName}: workspace has horizontal page overflow`);
  assert.deepEqual(layout.tooSmallTabs, [], `${viewportName}: workspace tab below 44px`);
  assert.equal(layout.tabOverflowX, 'auto', `${viewportName}: workspace tab strip must retain internal horizontal scrolling`);
  assert.ok(layout.tabScrollWidth >= layout.tabClientWidth, `${viewportName}: invalid tab strip geometry`);
}

const chrome = findChrome();
const userDataDir = await mkdtemp(join(tmpdir(), 'arvelis-chrome-'));
let vite;
let chromeProcess;
let client;
let viteLog = '';
let chromeLog = '';

try {
  vite = spawn('npm', ['run', 'dev'], {
    env: { ...process.env, VITE_REAL_AUTH_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });
  await waitForHttp(APP_URL);

  chromeProcess = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
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
  await client.send('Log.enable');
  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });

  await setViewport(client, { width: 390, height: 844, mobile: true });
  await client.send('Page.navigate', { url: APP_URL });
  await waitFor(client, "document.readyState === 'complete'", 'document ready');
  await waitFor(client, "Boolean(document.querySelector('#preview-profile-name'))", 'preview registration');

  await setControlValue(client, '#preview-profile-name', 'Acceptance QA');
  await clickButton(client, 'Продолжить');
  await waitFor(client, "Boolean(document.querySelector('.travel-app'))", 'Travel Home');
  await waitFor(client, "document.querySelector('.travel-hero h1')?.textContent?.includes('Путешествие')", 'Travel hero');

  await clickButton(client, 'Создать поездку');
  await waitFor(client, "document.querySelector('.travel-create h1')?.textContent?.trim() === 'Создать поездку'", 'Create Trip');
  await setControlValue(client, 'input[placeholder="Например, Казань"]', 'Казань');
  await setControlValue(client, 'input[placeholder="Страна или город"]', 'Сочи');
  await setControlValue(client, 'input[type="date"]', '2026-10-01', 0);
  await setControlValue(client, 'input[type="date"]', '2026-10-08', 1);
  await setControlValue(client, '.travel-form textarea', 'Без сложных пересадок');
  await clickButton(client, 'Море');
  await clickButton(client, 'Минимум пересадок');
  await clickButton(client, 'Сохранить черновик');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'saved Trip Workspace');
  assert.ok(await client.evaluate("document.body.textContent.includes('Казань → Сочи')"), 'Saved Trip title is missing');

  await clickButton(client, '← Мои поездки');
  await waitFor(client, "document.querySelector('.travel-title-row h1')?.textContent?.trim() === 'Мои поездки'", 'My Trips');
  const reopened = await client.evaluate(`(() => {
    const card = document.querySelector('.travel-trip-card');
    if (!card) return false;
    card.click();
    return true;
  })()`);
  assert.equal(reopened, true, 'Saved Trip card is missing from My Trips');
  await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", 'reopened Trip Workspace');

  const truthStates = [
    ['Маршрут', 'Маршрут по дням пока пуст'],
    ['Карта', 'Карта ещё не подключена'],
    ['Бюджет', 'Автоматические цены отсутствуют'],
    ['Legal', 'Юридическая проверка не запускалась'],
    ['Trip Book', 'PDF-генерация не включена в этот slice'],
  ];
  for (const [tab, expected] of truthStates) {
    await clickButton(client, tab);
    await waitFor(client, `document.body.textContent.includes(${JSON.stringify(expected)})`, `${tab} truth state`);
  }

  const viewports = [
    { name: 'iPhone portrait', width: 390, height: 844, mobile: true },
    { name: 'iPhone landscape', width: 844, height: 390, mobile: true },
    { name: 'Android narrow', width: 360, height: 800, mobile: true },
    { name: 'desktop', width: 1440, height: 900, mobile: false },
  ];

  for (const viewport of viewports) {
    await setViewport(client, viewport);
    await clickButton(client, 'Создать');
    await waitFor(client, "Boolean(document.querySelector('.travel-create'))", `${viewport.name} Create Trip`);
    await assertCreateLayout(client, viewport.name);

    await clickButton(client, 'Поездки');
    await waitFor(client, "document.querySelector('.travel-title-row h1')?.textContent?.trim() === 'Мои поездки'", `${viewport.name} My Trips`);
    const opened = await client.evaluate(`(() => {
      const card = document.querySelector('.travel-trip-card');
      if (!card) return false;
      card.click();
      return true;
    })()`);
    assert.equal(opened, true, `${viewport.name}: saved Trip card unavailable`);
    await waitFor(client, "Boolean(document.querySelector('.travel-workspace'))", `${viewport.name} Trip Workspace`);
    await assertWorkspaceLayout(client, viewport.name);
  }

  assert.deepEqual(client.runtimeErrors, [], `Browser runtime errors: ${client.runtimeErrors.join(' | ')}`);
  console.log('travel browser acceptance: PASS (Chromium viewports: iPhone portrait/landscape, Android narrow, desktop)');
} catch (error) {
  if (viteLog) console.error(`\n--- Vite output ---\n${viteLog.slice(-6000)}`);
  if (chromeLog) console.error(`\n--- Chrome output ---\n${chromeLog.slice(-6000)}`);
  throw error;
} finally {
  client?.close();
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill('SIGTERM');
  if (vite && !vite.killed) vite.kill('SIGTERM');
  await sleep(100);
  await rm(userDataDir, { recursive: true, force: true });
}
