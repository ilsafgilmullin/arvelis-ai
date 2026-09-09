import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const APP_URL = 'http://127.0.0.1:3000';
const API_URL = 'http://127.0.0.1:3001';
const DEBUG_URL = 'http://127.0.0.1:9222';
const databasePath = resolve(`.data/travel-browser-${process.pid}.sqlite`);
const sessionId = 'a'.repeat(32);
const sessionSecret = 'b'.repeat(64);
const sessionPepperHex = '22'.repeat(32);
const accountId = `browser-account-${process.pid}`;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function findChrome() {
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('Chrome/Chromium executable is unavailable on this runner.');
}

async function waitForHttp(url, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Startup race.
    }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.runtimeErrors = [];
  }

  async connect() {
    await new Promise((resolveConnect, rejectConnect) => {
      const timeout = setTimeout(() => rejectConnect(new Error('CDP connection timeout')), 5_000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolveConnect(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); rejectConnect(new Error('CDP connection failed')); }, { once: true });
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
        this.runtimeErrors.push('console.error');
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text ?? expression}`);
    return result.result?.value;
  }

  close() { this.socket.close(); }
}

async function waitFor(client, expression, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for browser state: ${label}`);
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
  assert.equal(changed, true, `Unable to set ${selector}[${index}]`);
}

async function clickExact(client, text, rootSelector = null) {
  const clicked = await client.evaluate(`(() => {
    const root = ${rootSelector ? `document.querySelector(${JSON.stringify(rootSelector)})` : 'document'};
    if (!root) return false;
    const button = [...root.querySelectorAll('button')].find((item) => item.getClientRects().length > 0 && !item.disabled && item.textContent?.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Button not found: ${text}`);
}

async function openDrawerItem(client, text) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Открыть меню"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert.equal(opened, true);
  await waitFor(client, "Boolean(document.querySelector('.travel-drawer'))", 'drawer');
  await clickExact(client, text, '.travel-drawer');
  await waitFor(client, "!document.querySelector('.travel-drawer')", `drawer close: ${text}`);
}

async function seedAuthenticatedAccount() {
  const database = new DatabaseSync(databasePath);
  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000;
  const mac = createHmac('sha256', Buffer.from(sessionPepperHex, 'hex'))
    .update(`session:v1\0${sessionId}\0${sessionSecret}`, 'utf8')
    .digest('hex');

  database.prepare(`
    INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
    VALUES (?, ?, 'active', 1, ?, ?)
  `).run(accountId, 'Browser QA', now, now);
  database.prepare(`
    INSERT INTO auth_email_identities (id, account_id, kind, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at)
    VALUES (?, ?, 'email_otp', ?, ?, ?, ?, NULL)
  `).run(`identity-${process.pid}`, accountId, `browser-${process.pid}@example.test`, now, now, now);
  database.prepare(`
    INSERT INTO auth_sessions (id, account_id, secret_mac, security_version, created_at, last_seen_at, expires_at, revoked_at, revoke_reason, device_label, browser_label)
    VALUES (?, ?, ?, 1, ?, ?, ?, NULL, NULL, 'Browser QA', 'Chromium')
  `).run(sessionId, accountId, mac, now, now, expiresAt);
  database.close();
}

const chrome = findChrome();
let dev;
let chromeProcess;
let client;
let devLog = '';

try {
  dev = spawn('npm', ['run', 'dev:auth'], {
    env: {
      ...process.env,
      AUTH_DB_PROVIDER: 'sqlite',
      AUTH_SQLITE_PATH: databasePath.replace(`${process.cwd()}/`, ''),
      AUTH_OTP_PEPPER_HEX: '11'.repeat(32),
      AUTH_SESSION_PEPPER_HEX: sessionPepperHex,
      AUTH_COOKIE_SECURE: 'never',
      AUTH_TRUST_PROXY: 'false',
      SMTP_PASSWORD: 'browser-test-not-used',
      VITE_REAL_AUTH_ENABLED: 'true',
      VITE_SHOW_DIAGNOSTICS: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  dev.stdout.on('data', (chunk) => { devLog += chunk.toString(); });
  dev.stderr.on('data', (chunk) => { devLog += chunk.toString(); });
  await waitForHttp(`${API_URL}/api/health`);
  await seedAuthenticatedAccount();
  await waitForHttp(APP_URL);

  chromeProcess = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9222', '--user-data-dir=/tmp/arvelis-trip-browser', 'about:blank',
  ], { stdio: 'ignore' });
  await waitForHttp(`${DEBUG_URL}/json/version`);
  const pageResponse = await fetch(`${DEBUG_URL}/json/new?about:blank`, { method: 'PUT' });
  assert.ok(pageResponse.ok);
  const page = await pageResponse.json();
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const cookie = await client.send('Network.setCookie', {
    name: 'arvelis_session',
    value: `${sessionId}.${sessionSecret}`,
    url: `${APP_URL}/`,
    httpOnly: true,
    sameSite: 'Lax',
  });
  assert.equal(cookie.success, true, 'Unable to seed browser session cookie');

  await client.send('Page.navigate', { url: APP_URL });
  await waitFor(client, "Boolean(document.querySelector('.travel-app'))", 'authenticated Travel app');
  await waitFor(client, "document.querySelector('.travel-shell')?.dataset.tripPersistence === 'server'", 'server Trip repository');
  assert.equal(await client.evaluate("document.body.textContent.includes('Куда отправимся?')"), true);

  await openDrawerItem(client, 'Создать поездку');
  await waitFor(client, "document.body.textContent.includes('ШАГ 1 ИЗ 3')", 'create step 1');
  await setControlValue(client, '.travel-form-grid input', 'Казань', 0);
  await setControlValue(client, '.travel-form-grid input', 'Сочи', 1);
  await setControlValue(client, 'input[type="date"]', '2026-10-01', 0);
  await setControlValue(client, 'input[type="date"]', '2026-10-08', 1);
  await clickExact(client, 'Продолжить');
  await waitFor(client, "document.body.textContent.includes('ШАГ 2 ИЗ 3')", 'create step 2');
  await setControlValue(client, '.travel-money-input input', '000150000');
  const formattedBudget = await client.evaluate("document.querySelector('.travel-money-input input')?.value ?? ''");
  assert.equal(formattedBudget.replace(/\s+/g, ' '), '150 000');
  await clickExact(client, 'Продолжить');
  await waitFor(client, "document.body.textContent.includes('ШАГ 3 ИЗ 3')", 'create step 3');
  await clickExact(client, 'Город');
  await clickExact(client, 'Еда');
  await clickExact(client, 'Поезд');
  await clickExact(client, 'Создать поездку');
  await waitFor(client, "document.body.textContent.includes('ПЛАНИРОВАНИЕ ПОЕЗДКИ') && document.body.textContent.includes('Сочи')", 'server-saved Trip workspace');

  await client.send('Page.reload');
  await waitFor(client, "Boolean(document.querySelector('.travel-app'))", 'app after reload');
  await waitFor(client, "document.querySelector('.travel-shell')?.dataset.tripPersistence === 'server'", 'server repository after reload');
  await openDrawerItem(client, 'Мои поездки');
  await waitFor(client, "document.body.textContent.includes('Сочи')", 'saved Trip after reload');
  const openedTrip = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('.travel-trip-card')].find((item) => item.textContent?.includes('Сочи'));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  assert.equal(openedTrip, true);
  await waitFor(client, "document.body.textContent.includes('ПЛАНИРОВАНИЕ ПОЕЗДКИ') && document.body.textContent.includes('Сочи')", 'reopened server Trip');

  await clickExact(client, 'Карта');
  await waitFor(client, "document.body.textContent.includes('Карта маршрута') && document.body.textContent.includes('После подключения картографического сервиса')", 'truthful map empty state');
  const mapTruth = await client.evaluate(`(() => {
    const schematic = document.querySelector('.travel-map-schematic');
    return {
      fakeSchematicVisible: schematic ? getComputedStyle(schematic).display !== 'none' : false,
      hasCanvas: Boolean(document.querySelector('canvas, .mapboxgl-map, .leaflet-container')),
    };
  })()`);
  assert.equal(mapTruth.fakeSchematicVisible, false, 'Decorative fake map schematic must not be visible');
  assert.equal(mapTruth.hasCanvas, false, 'No real map provider is connected in Map Foundation V1');

  const layout = await client.evaluate(`(() => ({
    innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    small: [...document.querySelectorAll('button, input, textarea')].filter((el) => el.getClientRects().length > 0).filter((el) => {
      const rect = el.getBoundingClientRect(); return rect.width < 43.5 || rect.height < 43.5;
    }).length,
  }))()`);
  assert.ok(layout.scrollWidth <= layout.innerWidth + 1, 'Horizontal overflow detected');
  assert.equal(layout.small, 0, 'Visible interactive control below 44px');
  assert.deepEqual(client.runtimeErrors, [], `Browser runtime errors: ${client.runtimeErrors.join(', ')}`);

  const database = new DatabaseSync(databasePath, { readOnly: true });
  const persisted = database.prepare('SELECT account_id, document_json FROM travel_trips WHERE account_id = ?').all(accountId);
  database.close();
  assert.equal(persisted.length, 1, 'Browser-created Trip must exist in server SQLite');
  const document = JSON.parse(String(persisted[0].document_json));
  assert.equal(document.ownerScopeId, accountId);
  assert.equal(document.destination, 'Сочи');
  assert.equal(document.durationDays, 8);
  assert.equal(document.budget.limitRub, 150000);

  console.log('travel browser server-persistence + truthful-map happy-path: PASS (390x844)');
} catch (error) {
  if (devLog) process.stderr.write(devLog.slice(-8_000));
  throw error;
} finally {
  client?.close();
  chromeProcess?.kill('SIGTERM');
  dev?.kill('SIGTERM');
  await sleep(500);
  await rm(databasePath, { force: true });
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
  await rm('/tmp/arvelis-trip-browser', { recursive: true, force: true });
}
