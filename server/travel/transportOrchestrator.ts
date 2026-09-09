import { randomUUID } from 'node:crypto';
import type { Trip } from '../../src/travel/domain';
import {
  createTransportSearchRequest,
  evaluateTransportRoutePolicy,
  validateTransportSearchResponse,
  type TransportRoutePolicy,
  type TransportSearchResponse,
  type TransportValidationError,
} from '../../src/travel/transportContracts';
import type { TransportProvider } from '../../src/travel/providers';

export const DEFAULT_TRANSPORT_PROVIDER_TIMEOUT_MS = 15_000;
export const MAX_TRANSPORT_PROVIDER_TIMEOUT_MS = 120_000;

export type TransportOrchestrationErrorCode =
  | 'invalid_input'
  | 'access_denied'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response'
  | 'invalid_configuration';

export type TransportOrchestrationStatus =
  | 'success'
  | 'rejected'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response';

export type TransportOrchestrationAudit = {
  version: 1;
  requestId: string;
  tripId: string;
  tripRevision: string;
  providerId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: TransportOrchestrationStatus;
  validationErrorCodes: TransportValidationError['code'][];
};

export type TransportOrchestrationResult = {
  response: TransportSearchResponse;
  routePolicies: Record<string, TransportRoutePolicy>;
  audit: TransportOrchestrationAudit;
};

export type TransportOrchestratorOptions = {
  provider: TransportProvider | null;
  timeoutMs?: number;
  now?: () => Date;
  requestId?: () => string;
};

type TransportOrchestrationErrorDetails = {
  audit?: TransportOrchestrationAudit;
  validationErrors?: TransportValidationError[];
  cause?: unknown;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMEOUT_MARKER = Symbol('transport-provider-timeout');
const ABORT_MARKER = Symbol('transport-provider-abort');

function validScopeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value.trim() === value;
}

function validIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER.test(value);
}

export class TransportOrchestrationError extends Error {
  readonly code: TransportOrchestrationErrorCode;
  readonly audit?: TransportOrchestrationAudit;
  readonly validationErrors?: TransportValidationError[];

  constructor(code: TransportOrchestrationErrorCode, message: string, details: TransportOrchestrationErrorDetails = {}) {
    super(message);
    this.name = 'TransportOrchestrationError';
    this.code = code;
    if (details.audit !== undefined) this.audit = details.audit;
    if (details.validationErrors !== undefined) this.validationErrors = details.validationErrors;
    if (details.cause !== undefined) Object.defineProperty(this, 'cause', { value: details.cause, enumerable: false });
  }
}

export class TransportOrchestrator {
  private readonly provider: TransportProvider | null;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly requestId: () => string;

  constructor(options: TransportOrchestratorOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TRANSPORT_PROVIDER_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TRANSPORT_PROVIDER_TIMEOUT_MS) {
      throw new TransportOrchestrationError('invalid_configuration', 'Transport provider timeout is outside the supported range.');
    }
    this.provider = options.provider;
    this.timeoutMs = timeoutMs;
    this.now = options.now ?? (() => new Date());
    this.requestId = options.requestId ?? (() => randomUUID());
  }

  private createAudit(
    requestId: string,
    trip: Trip,
    providerId: string | null,
    startedAt: Date,
    status: TransportOrchestrationStatus,
    validationErrors: TransportValidationError[] = [],
  ): TransportOrchestrationAudit {
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
      validationErrorCodes: validationErrors.map((error) => error.code),
    };
  }

  async run(accountScopeId: string, trip: Trip, callerSignal?: AbortSignal): Promise<TransportOrchestrationResult> {
    const startedAt = this.now();
    const requestId = this.requestId();
    const providerId = this.provider?.id ?? null;

    if (!validScopeId(accountScopeId)) {
      throw new TransportOrchestrationError('invalid_input', 'Account scope is invalid.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
      });
    }
    if (trip.ownerScopeId !== accountScopeId) {
      throw new TransportOrchestrationError('access_denied', 'Trip ownership does not match the authenticated account.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
      });
    }
    if (!validIdentifier(requestId)) {
      throw new TransportOrchestrationError('invalid_configuration', 'Transport request ID is invalid.');
    }

    let request;
    try {
      request = createTransportSearchRequest(trip);
    } catch (error) {
      throw new TransportOrchestrationError('invalid_input', 'Trip cannot produce a TransportSearchRequest V1.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
        cause: error,
      });
    }

    if (this.provider === null) {
      throw new TransportOrchestrationError('not_connected', 'Transport provider is not connected.', {
        audit: this.createAudit(requestId, trip, null, startedAt, 'not_connected'),
      });
    }
    if (!validIdentifier(this.provider.id)) {
      throw new TransportOrchestrationError('invalid_configuration', 'Transport provider ID is invalid.');
    }
    if (callerSignal?.aborted) {
      throw new TransportOrchestrationError('aborted', 'Transport orchestration was cancelled before provider execution.', {
        audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'aborted'),
      });
    }

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let callerAborted = false;
    let abortListener: (() => void) | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort(TIMEOUT_MARKER);
        reject(TIMEOUT_MARKER);
      }, this.timeoutMs);
    });

    const promises: Array<Promise<TransportSearchResponse>> = [
      this.provider.searchRoutes(request, {
        accountScopeId,
        tripId: trip.id,
        locale: 'ru-RU',
        requestId,
      }, controller.signal),
      timeoutPromise,
    ];

    if (callerSignal !== undefined) {
      promises.push(new Promise<never>((_, reject) => {
        abortListener = () => {
          callerAborted = true;
          controller.abort(callerSignal.reason);
          reject(ABORT_MARKER);
        };
        callerSignal.addEventListener('abort', abortListener, { once: true });
      }));
    }

    try {
      const response = await Promise.race(promises);
      const validationErrors = validateTransportSearchResponse(
        response,
        this.provider.id,
        requestId,
        request.legs.map((leg) => leg.id),
      );
      if (validationErrors.length > 0) {
        throw new TransportOrchestrationError('invalid_provider_response', 'Transport provider returned a response that violates the normalized contract.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'invalid_provider_response', validationErrors),
          validationErrors,
        });
      }

      const completedAt = this.now();
      const routePolicies = Object.fromEntries(
        response.routes.map((route) => [route.id, evaluateTransportRoutePolicy(route, response, completedAt)]),
      );
      return {
        response,
        routePolicies,
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
      if (error instanceof TransportOrchestrationError) throw error;
      if (error === TIMEOUT_MARKER || timedOut) {
        throw new TransportOrchestrationError('timeout', 'Transport provider exceeded the orchestration timeout.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'timeout'),
        });
      }
      if (error === ABORT_MARKER || callerAborted) {
        throw new TransportOrchestrationError('aborted', 'Transport orchestration was cancelled.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'aborted'),
        });
      }
      throw new TransportOrchestrationError('provider_failure', 'Transport provider failed.', {
        audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'provider_failure'),
        cause: error,
      });
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (callerSignal !== undefined && abortListener !== undefined) {
        callerSignal.removeEventListener('abort', abortListener);
      }
    }
  }
}
