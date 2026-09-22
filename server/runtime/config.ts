import type { SmtpEmailOtpDeliveryConfig } from '../auth/emailOtp/smtpDelivery';

export type CookieSecureMode = 'auto' | 'always' | 'never';
export type RuntimeProfile = 'closed_test' | 'release';
export type AuthDatabaseConfig =
  | { provider: 'sqlite'; path: string }
  | { provider: 'postgres'; url: string };

export type AuthRuntimeConfig = {
  profile: RuntimeProfile;
  port: number;
  database: AuthDatabaseConfig;
  otpPepper: Uint8Array;
  sessionPepper: Uint8Array;
  smtp: SmtpEmailOtpDeliveryConfig;
  trustProxy: boolean;
  cookieSecureMode: CookieSecureMode;
};

const CLOSED_TEST_SMTP_HOST = 'smtp.yandex.ru';
const CLOSED_TEST_SMTP_LOGIN = 'arvelis.auth';
const CLOSED_TEST_SMTP_FROM = 'arvelis.auth@yandex.ru';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid ${name}`);
  return value;
}

function optionalTrimmed(name: string, fallback: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (value.trim() !== value) throw new Error(`Invalid ${name}`);
  return value;
}

function parseRuntimeProfile(value: string | undefined): RuntimeProfile {
  if (value === undefined || value === '' || value === 'closed_test') return 'closed_test';
  if (value === 'release') return 'release';
  throw new Error('Invalid ARVELIS_RUNTIME_PROFILE');
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

function loadDatabaseConfig(profile: RuntimeProfile): AuthDatabaseConfig {
  const rawProvider = process.env.AUTH_DB_PROVIDER;
  if (profile === 'release' && rawProvider !== 'postgres') {
    throw new Error('Release profile requires explicit AUTH_DB_PROVIDER=postgres');
  }
  const provider = rawProvider?.trim() || 'sqlite';
  if (provider === 'sqlite') {
    const path = process.env.AUTH_SQLITE_PATH?.trim() || '.data/arvelis-auth.sqlite';
    if (!path) throw new Error('Invalid AUTH_SQLITE_PATH');
    return { provider: 'sqlite', path };
  }
  if (provider === 'postgres') return { provider: 'postgres', url: required('DATABASE_URL') };
  throw new Error('Invalid AUTH_DB_PROVIDER');
}

function loadSmtpConfig(profile: RuntimeProfile): SmtpEmailOtpDeliveryConfig {
  const port = parsePort(process.env.SMTP_PORT, 465);
  return {
    host: profile === 'release' ? required('SMTP_HOST') : optionalTrimmed('SMTP_HOST', CLOSED_TEST_SMTP_HOST),
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    username: profile === 'release' ? required('SMTP_USERNAME') : optionalTrimmed('SMTP_USERNAME', CLOSED_TEST_SMTP_LOGIN),
    password: required('SMTP_PASSWORD'),
    from: profile === 'release' ? required('SMTP_FROM') : optionalTrimmed('SMTP_FROM', CLOSED_TEST_SMTP_FROM),
  };
}

export function loadAuthRuntimeConfig(): AuthRuntimeConfig {
  const profile = parseRuntimeProfile(process.env.ARVELIS_RUNTIME_PROFILE);
  const cookieSecureMode = parseCookieSecureMode(process.env.AUTH_COOKIE_SECURE);
  if (profile === 'release' && cookieSecureMode !== 'always') {
    throw new Error('Release profile requires AUTH_COOKIE_SECURE=always');
  }
  return {
    profile,
    port: parsePort(process.env.AUTH_API_PORT, 3001),
    database: loadDatabaseConfig(profile),
    otpPepper: parseHexSecret('AUTH_OTP_PEPPER_HEX'),
    sessionPepper: parseHexSecret('AUTH_SESSION_PEPPER_HEX'),
    smtp: loadSmtpConfig(profile),
    trustProxy: parseBoolean(process.env.AUTH_TRUST_PROXY, false),
    cookieSecureMode,
  };
}
