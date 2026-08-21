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

const [major = 0, minor = 0] = process.versions.node.split('.').map((part) => Number(part));
add('Node runtime', major > 22 || (major === 22 && minor >= 12), `Node ${process.versions.node}`);

const databaseProvider = process.env.AUTH_DB_PROVIDER?.trim() || 'sqlite';
add('Test DB provider', databaseProvider === 'sqlite', databaseProvider === 'sqlite' ? 'SQLite selected' : 'Closed-test flow expects SQLite');

const sqlitePath = process.env.AUTH_SQLITE_PATH?.trim() || '.data/arvelis-auth.sqlite';
add('SQLite path', sqlitePath.length > 0, sqlitePath.length > 0 ? 'Configured' : 'Missing');

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

const rolloutEnabled = process.env.VITE_REAL_AUTH_ENABLED === 'true';
add('Rollout flag', !rolloutEnabled, rolloutEnabled ? 'Disable until E2E gate passes' : 'Safely disabled');

for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'WAIT'}  ${check.name}: ${check.detail}`);
}

const ready = checks.filter((check) => check.name !== 'Rollout flag').every((check) => check.ok)
  && !rolloutEnabled;

console.log(ready
  ? 'ARVELIS auth test environment: READY FOR SMTP/SQLite SMOKE (real-auth rollout still disabled)'
  : 'ARVELIS auth test environment: NOT READY');

if (!ready) process.exitCode = 1;
