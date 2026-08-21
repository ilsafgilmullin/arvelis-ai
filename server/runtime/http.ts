import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CookieSecureMode } from './config';

const MAX_JSON_BYTES = 16 * 1024;
const SESSION_COOKIE_NAME = 'arvelis_session';
const SESSION_CREDENTIAL_PATTERN = /^([a-f0-9]{32})\.([a-f0-9]{64})$/;

export type SessionCookieCredential = {
  sessionId: string;
  secret: string;
};

export async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new Error('unsupported_content_type');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_JSON_BYTES) throw new Error('body_too_large');
    chunks.push(buffer);
  }

  if (total === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid_json');
  return parsed as Record<string, unknown>;
}

export function sendJson(response: ServerResponse, status: number, body: unknown, headers?: Record<string, string>): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers) {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  }
  response.end(JSON.stringify(body));
}

export function sendNoContent(response: ServerResponse, headers?: Record<string, string>): void {
  response.statusCode = 204;
  response.setHeader('Cache-Control', 'no-store');
  if (headers) {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  }
  response.end();
}

function requestHost(request: IncomingMessage): string | null {
  const forwardedHost = request.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string' && forwardedHost.trim()) return forwardedHost.split(',')[0]?.trim() ?? null;
  const host = request.headers.host;
  return typeof host === 'string' && host.trim() ? host.trim() : null;
}

export function isTrustedSameOriginMutation(request: IncomingMessage): boolean {
  if (request.headers['x-arvelis-request'] !== '1') return false;

  const fetchSite = request.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    return false;
  }

  const origin = request.headers.origin;
  const host = requestHost(request);
  if (typeof origin !== 'string' || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requestIsSecure(request: IncomingMessage): boolean {
  const forwardedProto = request.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0]?.trim().toLowerCase() === 'https';
  }
  return Boolean((request.socket as typeof request.socket & { encrypted?: boolean }).encrypted);
}

function cookieSecure(request: IncomingMessage, mode: CookieSecureMode): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return requestIsSecure(request);
}

export function sessionSetCookie(
  request: IncomingMessage,
  credential: SessionCookieCredential,
  expiresAt: number,
  mode: CookieSecureMode,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const parts = [
    `${SESSION_COOKIE_NAME}=${credential.sessionId}.${credential.secret}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (cookieSecure(request, mode)) parts.push('Secure');
  return parts.join('; ');
}

export function sessionClearCookie(request: IncomingMessage, mode: CookieSecureMode): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (cookieSecure(request, mode)) parts.push('Secure');
  return parts.join('; ');
}

export function readSessionCookie(request: IncomingMessage): SessionCookieCredential | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = item.slice(separator + 1).trim();
    const match = SESSION_CREDENTIAL_PATTERN.exec(value);
    if (!match?.[1] || !match[2]) return null;
    return { sessionId: match[1], secret: match[2] };
  }
  return null;
}

export function getClientKey(request: IncomingMessage, trustProxy: boolean): string | undefined {
  if (!trustProxy) return undefined;
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded !== 'string') return undefined;
  const value = forwarded.split(',')[0]?.trim();
  if (!value || value.length > 128 || /[\r\n]/.test(value)) return undefined;
  return value;
}

export function getCoarseDeviceMetadata(request: IncomingMessage): { deviceLabel?: string; browserLabel?: string } {
  const userAgent = request.headers['user-agent'];
  if (typeof userAgent !== 'string' || !userAgent) return {};

  let deviceLabel = 'Desktop';
  if (/iPhone/i.test(userAgent)) deviceLabel = 'iPhone';
  else if (/iPad/i.test(userAgent)) deviceLabel = 'iPad';
  else if (/Android/i.test(userAgent)) deviceLabel = 'Android';
  else if (/Mobile/i.test(userAgent)) deviceLabel = 'Mobile';

  let browserLabel = 'Browser';
  if (/CriOS|Chrome/i.test(userAgent)) browserLabel = 'Chrome';
  else if (/FxiOS|Firefox/i.test(userAgent)) browserLabel = 'Firefox';
  else if (/EdgiOS|Edg\//i.test(userAgent)) browserLabel = 'Edge';
  else if (/Safari/i.test(userAgent) && !/Chrome|CriOS|Edg/i.test(userAgent)) browserLabel = 'Safari';

  return { deviceLabel, browserLabel };
}
