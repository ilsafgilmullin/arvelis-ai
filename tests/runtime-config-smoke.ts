import { loadAuthRuntimeConfig } from '../server/runtime/config';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const managedKeys = [
  'DATABASE_URL',
  'AUTH_OTP_PEPPER_HEX',
  'AUTH_SESSION_PEPPER_HEX',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USERNAME',
  'SMTP_PASSWORD',
  'SMTP_FROM',
] as const;

const saved = new Map<string, string | undefined>();
for (const key of managedKeys) saved.set(key, process.env[key]);

function resetBaseEnvironment(): void {
  for (const key of managedKeys) delete process.env[key];
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/arvelis_test';
  process.env.AUTH_OTP_PEPPER_HEX = '11'.repeat(32);
  process.env.AUTH_SESSION_PEPPER_HEX = '22'.repeat(32);
  process.env.SMTP_HOST = 'smtp.yandex.ru';
  process.env.SMTP_USERNAME = 'arvelis-test@yandex.ru';
  process.env.SMTP_PASSWORD = 'test-app-password';
  process.env.SMTP_FROM = 'arvelis-test@yandex.ru';
}

try {
  resetBaseEnvironment();
  const defaultSmtp = loadAuthRuntimeConfig();
  assert(defaultSmtp.smtp.host === 'smtp.yandex.ru', 'SMTP host must come from protected environment');
  assert(defaultSmtp.smtp.port === 465, 'Default SMTP port must be 465');
  assert(defaultSmtp.smtp.secure === true, 'Port 465 must default to secure SMTP');
  assert(defaultSmtp.smtp.username === 'arvelis-test@yandex.ru', 'SMTP username must come from protected environment');
  assert(defaultSmtp.smtp.password === 'test-app-password', 'SMTP app password must come from protected environment');

  resetBaseEnvironment();
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'false';
  const startTlsSmtp = loadAuthRuntimeConfig();
  assert(startTlsSmtp.smtp.port === 587 && startTlsSmtp.smtp.secure === false, 'Generic SMTP must allow explicit STARTTLS configuration');

  resetBaseEnvironment();
  process.env.SMTP_PORT = '0';
  let rejectedInvalidPort = false;
  try {
    loadAuthRuntimeConfig();
  } catch {
    rejectedInvalidPort = true;
  }
  assert(rejectedInvalidPort, 'Invalid SMTP port must be rejected');

  resetBaseEnvironment();
  delete process.env.SMTP_PASSWORD;
  let rejectedMissingPassword = false;
  try {
    loadAuthRuntimeConfig();
  } catch {
    rejectedMissingPassword = true;
  }
  assert(rejectedMissingPassword, 'Missing SMTP password must be rejected');
} finally {
  for (const key of managedKeys) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
