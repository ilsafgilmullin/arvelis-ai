import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Trip } from '../../src/travel/domain';
import { readJsonObject, sendJson } from '../runtime/http';
import { searchRoutesForAuthorizedTrip, type RoutesSearchSelectionV1 } from './routesSearchOrchestrator';
import type { RoutesResolutionRuntimeState } from './routesResolutionRuntime';
import { transportHttpFailure } from './transportSearchHttpBoundary';
import type { TransportSearchService } from './transportSearchService';

const ROUTES_SEARCH_JSON_LIMIT = 12 * 1024;
export const ROUTES_SEARCH_REQUEST_ID_HEADER = 'X-Arvelis-Request-Id';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function parseSelection(body: Record<string, unknown>): RoutesSearchSelectionV1 | null {
  const keys = Object.keys(body);
  if (keys.length === 0) return {};
  if (keys.length !== 1 || !Object.hasOwn(body, 'selection') || !isPlainRecord(body.selection)) return null;

  const selection = body.selection;
  const selectionKeys = Object.keys(selection);
  if (selectionKeys.some((key) => key !== 'originLocationId' && key !== 'destinationLocationId')) return null;

  const originLocationId = selection.originLocationId;
  const destinationLocationId = selection.destinationLocationId;
  if (originLocationId !== undefined && (typeof originLocationId !== 'string' || !originLocationId.startsWith('arvelis:'))) return null;
  if (destinationLocationId !== undefined && (typeof destinationLocationId !== 'string' || !destinationLocationId.startsWith('arvelis:'))) return null;

  return {
    ...(typeof originLocationId === 'string' ? { originLocationId } : {}),
    ...(typeof destinationLocationId === 'string' ? { destinationLocationId } : {}),
  };
}

/**
 * Authenticated HTTP adapter for the complete persisted-Trip Routes search workflow.
 * Authentication, same-origin enforcement and Trip ownership lookup remain owned by
 * runtime/server.ts. The client may only submit provider-neutral ARVELIS selections;
 * route labels, dates, passengers and provider bindings remain server-owned.
 */
export async function handleAuthorizedRoutesSearchHttp(input: {
  request: IncomingMessage;
  response: ServerResponse;
  runtime: RoutesResolutionRuntimeState;
  transportService: TransportSearchService;
  accountScopeId: string;
  trip: Trip;
}): Promise<void> {
  if (input.runtime.status !== 'ready') {
    sendJson(input.response, 503, {
      error: { code: 'service_unavailable', message: 'Routes search unavailable' },
    });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(input.request, ROUTES_SEARCH_JSON_LIMIT);
  } catch {
    sendJson(input.response, 400, {
      error: { code: 'invalid_input', message: 'Invalid routes search request' },
    });
    return;
  }

  const selection = parseSelection(body);
  if (selection === null) {
    sendJson(input.response, 400, {
      error: { code: 'invalid_input', message: 'Invalid routes search request' },
    });
    return;
  }

  const requestId = randomUUID();
  input.response.setHeader(ROUTES_SEARCH_REQUEST_ID_HEADER, requestId);

  const controller = new AbortController();
  const abort = () => controller.abort();
  input.request.once('aborted', abort);
  if (input.request.aborted) controller.abort();

  try {
    const result = await searchRoutesForAuthorizedTrip({
      resolutionService: input.runtime.service,
      transportService: input.transportService,
      accountScopeId: input.accountScopeId,
      trip: input.trip,
      selection,
      requestId,
      signal: controller.signal,
    });

    if (result.status === 'needs_disambiguation') {
      sendJson(input.response, 409, {
        status: result.status,
        field: result.resolution.field,
        code: result.resolution.code,
        candidates: structuredClone(result.resolution.candidates),
      });
      return;
    }

    if ('response' in result) {
      sendJson(input.response, 200, { status: result.status, response: result.response });
      return;
    }

    switch (result.code) {
      case 'trip_not_ready':
        sendJson(input.response, 409, {
          status: result.status,
          error: { code: result.code, message: 'Trip is not ready for routes search' },
        });
        return;
      case 'location_resolution_failed':
      case 'location_metadata_incomplete':
      case 'invalid_search_request':
        sendJson(input.response, 422, {
          status: result.status,
          error: { code: result.code, message: 'Routes search request cannot be executed' },
        });
        return;
      default: {
        const failure = transportHttpFailure(result);
        sendJson(input.response, failure.statusCode, failure.body);
      }
    }
  } finally {
    input.request.off('aborted', abort);
  }
}
