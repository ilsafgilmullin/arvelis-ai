const checks = [];

const CLOSED_TEST_SMTP_HOST = 'smtp.yandex.ru';
const CLOSED_TEST_SMTP_LOGIN = 'arvelis.auth';
const CLOSED_TEST_SMTP_FROM = 'arvelis.auth@yandex.ru';
const closedTestRuntime = process.argv.includes('--closed-test-runtime');

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

const smtpHost = plainValue('SMTP_HOST', CLOSED_TEST_SMTP_HOST);
const smtpUsername = plainValue('SMTP_USERNAME', CLOSED_TEST_SMTP_LOGIN);
const smtpFrom = plainValue('SMTP_FROM', CLOSED_TEST_SMTP_FROM);
add('SMTP host', smtpHost === CLOSED_TEST_SMTP_HOST, smtpHost === CLOSED_TEST_SMTP_HOST ? 'Yandex Mail test SMTP selected' : 'Expected smtp.yandex.ru');
add('SMTP port', plainValue('SMTP_PORT', '465') === '465', 'Closed-test preset uses 465');
add('SMTP secure', plainValue('SMTP_SECURE', 'true') === 'true', 'Closed-test preset requires SSL/SMTPS');
add('SMTP username', smtpUsername === CLOSED_TEST_SMTP_LOGIN, smtpUsername === CLOSED_TEST_SMTP_LOGIN ? 'Yandex mailbox login selected' : 'Unexpected test SMTP login');
add('SMTP password', present('SMTP_PASSWORD'), present('SMTP_PASSWORD') ? 'Configured' : 'Missing');
add('SMTP sender', smtpFrom === CLOSED_TEST_SMTP_FROM, smtpFrom === CLOSED_TEST_SMTP_FROM ? 'Closed-test sender selected' : 'Unexpected test sender');
add('SMTP identity', smtpFrom === `${smtpUsername}@yandex.ru`, 'Yandex SMTP login must correspond to the sender mailbox');

const rolloutEnabled = process.env.VITE_REAL_AUTH_ENABLED === 'true';
add(
  'Global rollout flag',
  !rolloutEnabled,
  rolloutEnabled
    ? 'Do not set VITE_REAL_AUTH_ENABLED globally in the closed-test environment'
    : closedTestRuntime
      ? 'Disabled globally; launcher will scope real-auth only to the Vite child process'
      : 'Safely disabled',
);

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'WAIT'}  ${check.name}: ${check.detail}`);
}

const ready = checks.every((check) => check.ok);

console.log(ready
  ? (closedTestRuntime
      ? 'ARVELIS auth test environment: READY FOR DEVELOPMENT/CLOSED-TEST REAL-AUTH RUNTIME'
      : 'ARVELIS auth test environment: READY FOR SMTP/SQLite SMOKE (real-auth rollout still disabled)')
  : 'ARVELIS auth test environment: NOT READY');

if (!ready) process.exitCode = 1;
