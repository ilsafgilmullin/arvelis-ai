import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonObject, sendJson } from '../runtime/http';
import { resolveRoutesInAuthenticatedRuntime } from './routesResolutionAuthenticatedRuntime';
import type { RoutesResolutionRuntimeState } from './routesResolutionRuntime';

const ROUTES_RESOLUTION_JSON_LIMIT = 12 * 1024;

/**
 * Node HTTP adapter for the authenticated Routes resolution boundary.
 * Authentication and same-origin enforcement remain owned by runtime/server.ts;
 * this adapter owns bounded JSON parsing, request cancellation and serialization.
 */
export async function handleAuthenticatedRoutesResolutionHttp(input: {
  request: IncomingMessage;
  response: ServerResponse;
  runtime: RoutesResolutionRuntimeState;
  accountScopeId: string;
}): Promise<void> {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(input.request, ROUTES_RESOLUTION_JSON_LIMIT);
  } catch {
    sendJson(input.response, 400, {
      error: { code: 'invalid_input', message: 'Invalid routes resolution request' },
    });
    return;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  input.request.once('aborted', abort);
  if (input.request.aborted) controller.abort();

  try {
    const result = await resolveRoutesInAuthenticatedRuntime({
      runtime: input.runtime,
      body,
      accountScopeId: input.accountScopeId,
      requestId: randomUUID(),
      signal: controller.signal,
    });
    sendJson(input.response, result.statusCode, result.body);
  } finally {
    input.request.off('aborted', abort);
  }
}
