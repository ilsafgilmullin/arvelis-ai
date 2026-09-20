import type { RoutesResolutionService, RoutesResolutionServiceOutcome } from './routesResolutionService';

export type RoutesResolutionHttpResult =
  | { statusCode: 200; body: { status: 'ready'; origin: { locationId: string }; destination: { locationId: string } } }
  | { statusCode: 409; body: Extract<RoutesResolutionServiceOutcome, { status: 'needs_disambiguation' }> }
  | { statusCode: 422; body: Extract<RoutesResolutionServiceOutcome, { status: 'blocked' }> };

/**
 * Authenticated runtime adapter for the provider-neutral Routes resolution service.
 * Provider search/station codes are deliberately stripped from the HTTP success payload:
 * they remain server-side inputs for the subsequent transport-search step.
 */
export async function resolveRoutesForAuthenticatedRequest(input: {
  service: RoutesResolutionService;
  request: unknown;
  accountScopeId: string;
  requestId: string;
  signal: AbortSignal;
}): Promise<RoutesResolutionHttpResult> {
  const result = await input.service.resolve(input.request, {
    accountScopeId: input.accountScopeId,
    requestId: input.requestId,
    signal: input.signal,
  });

  if (result.status === 'ready') {
    return {
      statusCode: 200,
      body: {
        status: 'ready',
        origin: { locationId: result.origin.locationId },
        destination: { locationId: result.destination.locationId },
      },
    };
  }

  if (result.status === 'needs_disambiguation') {
    return { statusCode: 409, body: structuredClone(result) };
  }

  return { statusCode: 422, body: { ...result } };
}
