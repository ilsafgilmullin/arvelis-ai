import { resolveRoutesForAuthenticatedRequest, type RoutesResolutionHttpResult } from './routesResolutionHttpBoundary';
import type { RoutesResolutionRuntimeState } from './routesResolutionRuntime';

export type AuthenticatedRoutesResolutionRuntimeResult =
  | RoutesResolutionHttpResult
  | { statusCode: 400; body: { error: { code: 'invalid_input'; message: 'Invalid routes resolution request' } } }
  | { statusCode: 503; body: { error: { code: 'service_unavailable'; message: 'Routes resolution unavailable' } } };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Authenticated runtime boundary immediately behind the HTTP server's existing
 * same-origin/session guard. It owns the exact request envelope and refuses to
 * execute when the durable Location Directory / trusted-binding runtime is disabled.
 *
 * The caller supplies accountScopeId only from the authenticated ARVELIS session;
 * provider identifiers remain server-side inside RoutesResolutionService.
 */
export async function resolveRoutesInAuthenticatedRuntime(input: {
  runtime: RoutesResolutionRuntimeState;
  body: unknown;
  accountScopeId: string;
  requestId: string;
  signal: AbortSignal;
}): Promise<AuthenticatedRoutesResolutionRuntimeResult> {
  if (input.runtime.status !== 'ready') {
    return {
      statusCode: 503,
      body: { error: { code: 'service_unavailable', message: 'Routes resolution unavailable' } },
    };
  }

  if (!isPlainRecord(input.body)
    || Object.keys(input.body).length !== 1
    || !Object.hasOwn(input.body, 'request')) {
    return {
      statusCode: 400,
      body: { error: { code: 'invalid_input', message: 'Invalid routes resolution request' } },
    };
  }

  return resolveRoutesForAuthenticatedRequest({
    service: input.runtime.service,
    request: input.body.request,
    accountScopeId: input.accountScopeId,
    requestId: input.requestId,
    signal: input.signal,
  });
}
