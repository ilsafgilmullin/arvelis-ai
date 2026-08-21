import { loadAuthRuntimeConfig } from '../server/runtime/config';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const managedKeys = [
  'DATABASE_URL',
  'AUTH_OTP_PEPPER_HEX',
  'AUTH_SESSION_PEPPER_HEX',
  'EMAIL_DELIVERY_PROVIDER',
  'POSTBOX_API_KEY_ID',
  'POSTBOX_API_KEY_SECRET',
  'POSTBOX_FROM',
  'POSTBOX_SMTP_PORT',
  'POSTBOX_SMTP_SECURE',
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
  process.env.POSTBOX_API_KEY_ID = 'test-api-key-id';
  process.env.POSTBOX_API_KEY_SECRET = 'test-api-key-secret';
  process.env.POSTBOX_FROM = 'auth@example.test';
}

try {
  resetBaseEnvironment();
  const defaultPostbox = loadAuthRuntimeConfig();
  assert(defaultPostbox.emailDeliveryProvider === 'yandex_cloud_postbox', 'Postbox must be the approved default provider');
  assert(defaultPostbox.smtp.host === 'postbox.cloud.yandex.net', 'Postbox host must be fixed to official SMTP endpoint');
  assert(defaultPostbox.smtp.port === 587 && defaultPostbox.smtp.secure === false, 'Postbox default must use STARTTLS on 587');
  assert(defaultPostbox.smtp.username === 'test-api-key-id', 'Postbox API key ID must map to SMTP username');
  assert(defaultPostbox.smtp.password === 'test-api-key-secret', 'Postbox API key secret must map to SMTP password');

  resetBaseEnvironment();
  process.env.POSTBOX_SMTP_PORT = '465';
  process.env.POSTBOX_SMTP_SECURE = 'true';
  const smtpsPostbox = loadAuthRuntimeConfig();
  assert(smtpsPostbox.smtp.port === 465 && smtpsPostbox.smtp.secure === true, 'Postbox SMTPS must use 465 + secure');

  resetBaseEnvironment();
  process.env.POSTBOX_SMTP_PORT = '465';
  process.env.POSTBOX_SMTP_SECURE = 'false';
  let rejectedInvalidPostboxTls = false;
  try {
    loadAuthRuntimeConfig();
  } catch {
    rejectedInvalidPostboxTls = true;
  }
  assert(rejectedInvalidPostboxTls, 'Invalid Postbox TLS/port pairing must be rejected');

  resetBaseEnvironment();
  process.env.EMAIL_DELIVERY_PROVIDER = 'smtp';
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_USERNAME = 'smtp-user';
  process.env.SMTP_PASSWORD = 'smtp-secret';
  process.env.SMTP_FROM = 'auth@example.test';
  const genericSmtp = loadAuthRuntimeConfig();
  assert(genericSmtp.emailDeliveryProvider === 'smtp', 'Generic SMTP fallback must remain replaceable');
  assert(genericSmtp.smtp.host === 'smtp.example.test', 'Generic SMTP host must come from environment');
} finally {
  for (const key of managedKeys) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
