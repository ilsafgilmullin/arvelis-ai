import type { SmtpEmailOtpDeliveryConfig } from '../auth/emailOtp/smtpDelivery';

export type CookieSecureMode = 'auto' | 'always' | 'never';

export type AuthRuntimeConfig = {
  port: number;
  databaseUrl: string;
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

export function loadAuthRuntimeConfig(): AuthRuntimeConfig {
  const smtpPort = parsePort(process.env.SMTP_PORT, 587);
  const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);

  return {
    port: parsePort(process.env.AUTH_API_PORT, 3001),
    databaseUrl: required('DATABASE_URL'),
    otpPepper: parseHexSecret('AUTH_OTP_PEPPER_HEX'),
    sessionPepper: parseHexSecret('AUTH_SESSION_PEPPER_HEX'),
    smtp: {
      host: required('SMTP_HOST'),
      port: smtpPort,
      secure: smtpSecure,
      username: required('SMTP_USERNAME'),
      password: required('SMTP_PASSWORD'),
      from: required('SMTP_FROM'),
    },
    trustProxy: parseBoolean(process.env.AUTH_TRUST_PROXY, false),
    cookieSecureMode: parseCookieSecureMode(process.env.AUTH_COOKIE_SECURE),
  };
}
