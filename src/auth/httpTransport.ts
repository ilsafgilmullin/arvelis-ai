import type { AuthCompleteRequest, AuthStartRequest } from './contracts';
import { createGuardedAuthGateway, type AuthTransport } from './guardedGateway';

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'X-Arvelis-Request': '1',
} as const;

async function readUnknownJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Unexpected auth response content type');
  }
  return response.json() as Promise<unknown>;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Auth request failed');
  return readUnknownJson(response);
}

async function mutateJson(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export class HttpAuthTransport implements AuthTransport {
  async getMethods(): Promise<unknown> {
    return getJson('/api/auth/methods');
  }

  async restoreSession(): Promise<unknown> {
    return getJson('/api/auth/session');
  }

  async start(request: AuthStartRequest): Promise<unknown> {
    const response = await mutateJson('/api/auth/start', 'POST', request);
    const body = await readUnknownJson(response);
    if (response.status >= 500 && response.status <= 599) throw new Error('Auth service unavailable');
    return body;
  }

  async complete(request: AuthCompleteRequest): Promise<unknown> {
    const response = await mutateJson('/api/auth/complete', 'POST', request);
    const body = await readUnknownJson(response);
    if (response.status >= 500 && response.status <= 599) throw new Error('Auth service unavailable');
    return body;
  }

  async signOut(): Promise<void> {
    const response = await mutateJson('/api/auth/sign-out', 'POST');
    if (!response.ok) throw new Error('Sign out failed');
  }

  async listSessions(): Promise<unknown> {
    return getJson('/api/auth/sessions');
  }

  async revokeSession(sessionId: string): Promise<void> {
    const response = await mutateJson(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, 'DELETE');
    if (!response.ok) throw new Error('Session revoke failed');
  }
}

export const realAuthGateway = createGuardedAuthGateway(new HttpAuthTransport());
