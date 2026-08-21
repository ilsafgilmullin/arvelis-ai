const checks = [];

function add(name, ok, detail) {
  checks.push({ name, ok, detail });
}

function present(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function validHexSecret(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length >= 64 && value.length % 2 === 0 && /^[a-f0-9]+$/i.test(value);
}

function plainValue(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

const [major = 0, minor = 0] = process.versions.node.split('.').map((part) => Number(part));
add('Node runtime', major > 22 || (major === 22 && minor >= 12), `Node ${process.versions.node}`);

const databaseProvider = plainValue('AUTH_DB_PROVIDER', 'sqlite');
add('Test DB provider', databaseProvider === 'sqlite', databaseProvider === 'sqlite' ? 'SQLite selected' : 'Closed-test flow expects SQLite');

const sqlitePath = plainValue('AUTH_SQLITE_PATH', '.data/arvelis-auth.sqlite');
add(
  'SQLite path',
  sqlitePath === '.data/arvelis-auth.sqlite',
  sqlitePath === '.data/arvelis-auth.sqlite' ? 'Protected test path selected' : 'Closed-test path must be .data/arvelis-auth.sqlite',
);

add('Auth API port', plainValue('AUTH_API_PORT', '3001') === '3001', 'Closed-test auth API uses loopback port 3001');
add('Proxy trust', plainValue('AUTH_TRUST_PROXY', 'false') === 'false', 'Closed test keeps forwarded client identity disabled until proxy trust is audited');
add('Cookie mode', plainValue('AUTH_COOKIE_SECURE', 'auto') === 'auto', 'Closed-test cookie mode must be auto');

add('OTP pepper', validHexSecret('AUTH_OTP_PEPPER_HEX'), validHexSecret('AUTH_OTP_PEPPER_HEX') ? 'Configured' : 'Missing or invalid');
add('Session pepper', validHexSecret('AUTH_SESSION_PEPPER_HEX'), validHexSecret('AUTH_SESSION_PEPPER_HEX') ? 'Configured' : 'Missing or invalid');
add(
  'Independent peppers',
  validHexSecret('AUTH_OTP_PEPPER_HEX')
    && validHexSecret('AUTH_SESSION_PEPPER_HEX')
    && process.env.AUTH_OTP_PEPPER_HEX !== process.env.AUTH_SESSION_PEPPER_HEX,
  'Secrets must be different',
);

add('SMTP host', process.env.SMTP_HOST === 'smtp.yandex.ru', process.env.SMTP_HOST === 'smtp.yandex.ru' ? 'Yandex Mail test SMTP selected' : 'Expected smtp.yandex.ru');
add('SMTP port', (process.env.SMTP_PORT ?? '465') === '465', 'Closed-test preset uses 465');
add('SMTP secure', (process.env.SMTP_SECURE ?? 'true') === 'true', 'Closed-test preset requires SSL/SMTPS');
add('SMTP username', present('SMTP_USERNAME'), present('SMTP_USERNAME') ? 'Configured' : 'Missing');
add('SMTP password', present('SMTP_PASSWORD'), present('SMTP_PASSWORD') ? 'Configured' : 'Missing');
add('SMTP sender', present('SMTP_FROM'), present('SMTP_FROM') ? 'Configured' : 'Missing');
add(
  'SMTP identity',
  present('SMTP_USERNAME') && present('SMTP_FROM') && process.env.SMTP_USERNAME === process.env.SMTP_FROM,
  'Yandex test sender must match the authenticated mailbox',
);

const rolloutEnabled = process.env.VITE_REAL_AUTH_ENABLED === 'true';
add('Rollout flag', !rolloutEnabled, rolloutEnabled ? 'Disable until E2E gate passes' : 'Safely disabled');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'WAIT'}  ${check.name}: ${check.detail}`);
}

const ready = checks.every((check) => check.ok);

console.log(ready
  ? 'ARVELIS auth test environment: READY FOR SMTP/SQLite SMOKE (real-auth rollout still disabled)'
  : 'ARVELIS auth test environment: NOT READY');

if (!ready) process.exitCode = 1;
