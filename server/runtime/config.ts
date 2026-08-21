import type { SmtpEmailOtpDeliveryConfig } from '../auth/emailOtp/smtpDelivery';

export type CookieSecureMode = 'auto' | 'always' | 'never';
export type AuthDatabaseConfig =
  | { provider: 'sqlite'; path: string }
  | { provider: 'postgres'; url: string };

export type AuthRuntimeConfig = {
  port: number;
  database: AuthDatabaseConfig;
  otpPepper: Uint8Array;
  sessionPepper: Uint8Array;
  smtp: SmtpEmailOtpDeliveryConfig;
  trustProxy: boolean;
  cookieSecureMode: CookieSecureMode;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid ${name}`);
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port configuration');
  return port;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid boolean configuration');
}

function parseCookieSecureMode(value: string | undefined): CookieSecureMode {
  if (value === undefined || value === '' || value === 'auto') return 'auto';
  if (value === 'always' || value === 'never') return value;
  throw new Error('Invalid AUTH_COOKIE_SECURE mode');
}

function parseHexSecret(name: string): Uint8Array {
  const value = required(name);
  if (value.length < 64 || value.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(value)) {
    throw new Error(`${name} must contain at least 32 random bytes encoded as hex`);
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function loadDatabaseConfig(): AuthDatabaseConfig {
  const provider = process.env.AUTH_DB_PROVIDER?.trim() || 'sqlite';
  if (provider === 'sqlite') {
    const path = process.env.AUTH_SQLITE_PATH?.trim() || '.data/arvelis-auth.sqlite';
    if (!path) throw new Error('Invalid AUTH_SQLITE_PATH');
    return { provider: 'sqlite', path };
  }
  if (provider === 'postgres') return { provider: 'postgres', url: required('DATABASE_URL') };
  throw new Error('Invalid AUTH_DB_PROVIDER');
}

function loadSmtpConfig(): SmtpEmailOtpDeliveryConfig {
  const port = parsePort(process.env.SMTP_PORT, 465);
  return {
    host: required('SMTP_HOST'),
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    username: required('SMTP_USERNAME'),
    password: required('SMTP_PASSWORD'),
    from: required('SMTP_FROM'),
  };
}

export function loadAuthRuntimeConfig(): AuthRuntimeConfig {
  return {
    port: parsePort(process.env.AUTH_API_PORT, 3001),
    database: loadDatabaseConfig(),
    otpPepper: parseHexSecret('AUTH_OTP_PEPPER_HEX'),
    sessionPepper: parseHexSecret('AUTH_SESSION_PEPPER_HEX'),
    smtp: loadSmtpConfig(),
    trustProxy: parseBoolean(process.env.AUTH_TRUST_PROXY, false),
    cookieSecureMode: parseCookieSecureMode(process.env.AUTH_COOKIE_SECURE),
  };
}
