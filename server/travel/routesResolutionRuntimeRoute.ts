import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { DatabaseSync } from 'node:sqlite';
import { handleAuthenticatedRoutesResolutionHttp } from './routesResolutionHttpRouteAdapter';
import { loadRoutesResolutionRuntime, type RoutesResolutionRuntimeState } from './routesResolutionRuntime';

export type RoutesResolutionRuntimeDatabase =
  | { provider: 'postgres'; pool: Pool }
  | { provider: 'sqlite'; database: DatabaseSync };

export type AuthenticatedRoutesResolutionRuntimeRoute = {
  runtime: RoutesResolutionRuntimeState;
  handle(input: {
    request: IncomingMessage;
    response: ServerResponse;
    accountScopeId: string;
  }): Promise<void>;
};

/**
 * Composes the durable Routes resolution runtime once at server startup and exposes
 * the authenticated HTTP adapter without accepting provider identifiers from callers.
 * Missing/invalid trusted bindings remain represented by the fail-closed disabled
 * runtime state and are serialized as 503 by the authenticated boundary.
 */
export async function createAuthenticatedRoutesResolutionRuntimeRoute(input: {
  database: RoutesResolutionRuntimeDatabase;
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
}): Promise<AuthenticatedRoutesResolutionRuntimeRoute> {
  const runtime = await loadRoutesResolutionRuntime({
    database: input.database,
    ...(input.env === undefined ? {} : { env: input.env }),
    ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
  });

  return {
    runtime,
    handle: async ({ request, response, accountScopeId }) => {
      await handleAuthenticatedRoutesResolutionHttp({
        request,
        response,
        runtime,
        accountScopeId,
      });
    },
  };
}
