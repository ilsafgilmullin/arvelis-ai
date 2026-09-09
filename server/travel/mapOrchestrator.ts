import { randomUUID } from 'node:crypto';
import type { Trip } from '../../src/travel/domain';
import {
  createMapRouteRequest,
  evaluateMapResponsePolicy,
  validateMapRouteResponse,
  type MapResponsePolicy,
  type MapRouteResponse,
  type MapValidationError,
} from '../../src/travel/mapContracts';
import type { MapProvider } from '../../src/travel/providers';

export const DEFAULT_MAP_PROVIDER_TIMEOUT_MS = 12_000;
export const MAX_MAP_PROVIDER_TIMEOUT_MS = 60_000;

export type MapOrchestrationErrorCode =
  | 'invalid_input'
  | 'access_denied'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response'
  | 'invalid_configuration';

export type MapOrchestrationAudit = {
  version: 1;
  requestId: string;
  tripId: string;
  tripRevision: string;
  providerId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'rejected' | 'not_connected' | 'aborted' | 'timeout' | 'provider_failure' | 'invalid_provider_response';
  validationErrorCodes: MapValidationError['code'][];
};

export type MapOrchestrationResult = {
  response: MapRouteResponse;
  policy: MapResponsePolicy;
  audit: MapOrchestrationAudit;
};

export class MapOrchestrationError extends Error {
  readonly code: MapOrchestrationErrorCode;
  readonly audit?: MapOrchestrationAudit;
  readonly validationErrors?: MapValidationError[];

  constructor(code: MapOrchestrationErrorCode, message: string, details: { audit?: MapOrchestrationAudit; validationErrors?: MapValidationError[]; cause?: unknown } = {}) {
    super(message);
    this.name = 'MapOrchestrationError';
    this.code = code;
    if (details.audit) this.audit = details.audit;
    if (details.validationErrors) this.validationErrors = details.validationErrors;
    if (details.cause !== undefined) Object.defineProperty(this, 'cause', { value: details.cause, enumerable: false });
  }
}

export class MapOrchestrator {
  private readonly provider: MapProvider | null;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly requestId: () => string;

  constructor(options: { provider: MapProvider | null; timeoutMs?: number; now?: () => Date; requestId?: () => string }) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_MAP_PROVIDER_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_MAP_PROVIDER_TIMEOUT_MS) {
      throw new MapOrchestrationError('invalid_configuration', 'Map provider timeout is outside the supported range.');
    }
    this.provider = options.provider;
    this.timeoutMs = timeoutMs;
    this.now = options.now ?? (() => new Date());
    this.requestId = options.requestId ?? (() => randomUUID());
  }

  private audit(requestId: string, trip: Trip, providerId: string | null, startedAt: Date, status: MapOrchestrationAudit['status'], errors: MapValidationError[] = []): MapOrchestrationAudit {
    const completedAt = this.now();
    return {
      version: 1,
      requestId,
      tripId: trip.id,
      tripRevision: trip.updatedAt,
      providerId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      status,
      validationErrorCodes: errors.map((error) => error.code),
    };
  }

  async run(accountScopeId: string, trip: Trip, callerSignal?: AbortSignal): Promise<MapOrchestrationResult> {
    const startedAt = this.now();
    const requestId = this.requestId();
    const providerId = this.provider?.id ?? null;
    if (!accountScopeId.trim() || accountScopeId.length > 128) {
      throw new MapOrchestrationError('invalid_input', 'Account scope is invalid.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected') });
    }
    if (trip.ownerScopeId !== accountScopeId) {
      throw new MapOrchestrationError('access_denied', 'Trip ownership does not match the authenticated account.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected') });
    }

    let request;
    try {
      request = createMapRouteRequest(trip);
    } catch (error) {
      throw new MapOrchestrationError('invalid_input', 'Trip cannot produce a MapRouteRequest V1.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected'), cause: error });
    }

    if (this.provider === null) {
      throw new MapOrchestrationError('not_connected', 'Map provider is not connected.', { audit: this.audit(requestId, trip, null, startedAt, 'not_connected') });
    }
    if (callerSignal?.aborted) {
      throw new MapOrchestrationError('aborted', 'Map orchestration was cancelled before provider execution.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'aborted') });
    }

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    let timedOut = false;
    let callerAborted = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('map-timeout'));
      }, this.timeoutMs);
    });

    const promises: Array<Promise<MapRouteResponse>> = [
      this.provider.resolveRouteMap(request, { accountScopeId, tripId: trip.id, locale: 'ru-RU', requestId }, controller.signal),
      timeoutPromise,
    ];
    if (callerSignal) {
      promises.push(new Promise<never>((_, reject) => {
        abortListener = () => {
          callerAborted = true;
          controller.abort(callerSignal.reason);
          reject(new Error('map-aborted'));
        };
        callerSignal.addEventListener('abort', abortListener, { once: true });
      }));
    }

    try {
      const response = await Promise.race(promises);
      const validationErrors = validateMapRouteResponse(response, this.provider.id, requestId, request);
      if (validationErrors.length > 0) {
        throw new MapOrchestrationError('invalid_provider_response', 'Map provider returned a response that violates the normalized contract.', {
          audit: this.audit(requestId, trip, this.provider.id, startedAt, 'invalid_provider_response', validationErrors),
          validationErrors,
        });
      }
      const completedAt = this.now();
      return {
        response,
        policy: evaluateMapResponsePolicy(response, completedAt),
        audit: {
          version: 1,
          requestId,
          tripId: trip.id,
          tripRevision: trip.updatedAt,
          providerId: this.provider.id,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          status: 'success',
          validationErrorCodes: [],
        },
      };
    } catch (error) {
      if (error instanceof MapOrchestrationError) throw error;
      if (timedOut) throw new MapOrchestrationError('timeout', 'Map provider exceeded the orchestration timeout.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'timeout') });
      if (callerAborted) throw new MapOrchestrationError('aborted', 'Map orchestration was cancelled.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'aborted') });
      throw new MapOrchestrationError('provider_failure', 'Map provider failed.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'provider_failure'), cause: error });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (callerSignal && abortListener) callerSignal.removeEventListener('abort', abortListener);
    }
  }
}
