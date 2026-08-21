import type {
  AuthCompleteRequest,
  AuthCompleteResult,
  AuthGateway,
  AuthSession,
  AuthSessionSummary,
  AuthStartRequest,
  AuthStartResult,
} from './contracts';
import {
  isAuthChallenge,
  isAuthFailure,
  isAuthMethodDescriptor,
  isAuthSession,
  isAuthSessionSummary,
  normalizeAuthMethodCatalog,
} from './runtimeGuards';

type UnknownRecord = Record<string, unknown>;

export interface AuthTransport {
  getMethods(): Promise<unknown>;
  restoreSession(): Promise<unknown>;
  start(request: AuthStartRequest): Promise<unknown>;
  complete(request: AuthCompleteRequest): Promise<unknown>;
  signOut(): Promise<void>;
  listSessions(): Promise<unknown>;
  revokeSession(sessionId: string): Promise<void>;
}

export class AuthProtocolError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`Invalid auth protocol response: ${operation}`);
    this.name = 'AuthProtocolError';
    this.operation = operation;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertUniqueIds(items: ReadonlyArray<{ id: string }>, operation: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new AuthProtocolError(operation);
    ids.add(item.id);
  }
}

function parseStartResult(value: unknown): AuthStartResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new AuthProtocolError('start');
  }

  if (value.ok === true && isAuthChallenge(value.challenge)) {
    return { ok: true, challenge: value.challenge };
  }

  if (value.ok === false && isAuthFailure(value.error)) {
    return { ok: false, error: value.error };
  }

  throw new AuthProtocolError('start');
}

function parseCompleteResult(value: unknown): AuthCompleteResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new AuthProtocolError('complete');
  }

  if (value.ok === true && isAuthSession(value.session)) {
    return { ok: true, session: value.session };
  }

  if (value.ok === false && isAuthFailure(value.error)) {
    return { ok: false, error: value.error };
  }

  throw new AuthProtocolError('complete');
}

function parseMethods(value: unknown) {
  if (!Array.isArray(value) || !value.every(isAuthMethodDescriptor)) {
    throw new AuthProtocolError('methods');
  }

  assertUniqueIds(value, 'methods');
  return normalizeAuthMethodCatalog(value);
}

function parseSession(value: unknown): AuthSession | null {
  if (value === null) return null;
  if (isAuthSession(value)) return value;
  throw new AuthProtocolError('session');
}

function parseSessions(value: unknown): AuthSessionSummary[] {
  if (!Array.isArray(value) || !value.every(isAuthSessionSummary)) {
    throw new AuthProtocolError('sessions');
  }

  assertUniqueIds(value, 'sessions');
  return value;
}

/**
 * Converts an untrusted transport into the typed application auth port.
 *
 * Provider SDKs and raw HTTP clients belong behind AuthTransport. Components
 * and app state consume only this guarded AuthGateway surface.
 */
export function createGuardedAuthGateway(transport: AuthTransport): AuthGateway {
  return {
    async getMethods() {
      return parseMethods(await transport.getMethods());
    },

    async restoreSession() {
      return parseSession(await transport.restoreSession());
    },

    async start(request) {
      return parseStartResult(await transport.start(request));
    },

    async complete(request) {
      return parseCompleteResult(await transport.complete(request));
    },

    async signOut() {
      await transport.signOut();
    },

    async listSessions() {
      return parseSessions(await transport.listSessions());
    },

    async revokeSession(sessionId) {
      if (!sessionId.trim()) throw new AuthProtocolError('revoke-session');
      await transport.revokeSession(sessionId);
    },
  };
}
