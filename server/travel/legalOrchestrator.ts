import { randomUUID } from 'node:crypto';
import type { Trip } from '../../src/travel/domain';
import {
  createLegalCheckRequest,
  evaluateLegalClaimPolicies,
  validateLegalCheckResponse,
  type LegalCheckResponse,
  type LegalClaimPolicy,
  type LegalValidationError,
} from '../../src/travel/legalContracts';
import type { LegalSourceProvider } from '../../src/travel/providers';

export const DEFAULT_LEGAL_PROVIDER_TIMEOUT_MS = 12_000;
export const MAX_LEGAL_PROVIDER_TIMEOUT_MS = 60_000;

export type LegalOrchestrationErrorCode =
  | 'invalid_input'
  | 'access_denied'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response'
  | 'invalid_configuration';

export type LegalOrchestrationAudit = {
  version: 1;
  requestId: string;
  tripId: string;
  tripRevision: string;
  providerId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'rejected' | 'not_connected' | 'aborted' | 'timeout' | 'provider_failure' | 'invalid_provider_response';
  validationErrorCodes: LegalValidationError['code'][];
};

export type LegalOrchestrationResult = {
  response: LegalCheckResponse;
  policies: LegalClaimPolicy[];
  audit: LegalOrchestrationAudit;
};

export class LegalOrchestrationError extends Error {
  readonly code: LegalOrchestrationErrorCode;
  readonly audit?: LegalOrchestrationAudit;
  readonly validationErrors?: LegalValidationError[];

  constructor(code: LegalOrchestrationErrorCode, message: string, details: { audit?: LegalOrchestrationAudit; validationErrors?: LegalValidationError[]; cause?: unknown } = {}) {
    super(message);
    this.name = 'LegalOrchestrationError';
    this.code = code;
    if (details.audit) this.audit = details.audit;
    if (details.validationErrors) this.validationErrors = details.validationErrors;
    if (details.cause !== undefined) Object.defineProperty(this, 'cause', { value: details.cause, enumerable: false });
  }
}

export class LegalOrchestrator {
  private readonly provider: LegalSourceProvider | null;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly requestId: () => string;

  constructor(options: { provider: LegalSourceProvider | null; timeoutMs?: number; now?: () => Date; requestId?: () => string }) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_LEGAL_PROVIDER_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LEGAL_PROVIDER_TIMEOUT_MS) {
      throw new LegalOrchestrationError('invalid_configuration', 'Legal provider timeout is outside the supported range.');
    }
    this.provider = options.provider;
    this.timeoutMs = timeoutMs;
    this.now = options.now ?? (() => new Date());
    this.requestId = options.requestId ?? (() => randomUUID());
  }

  private audit(requestId: string, trip: Trip, providerId: string | null, startedAt: Date, status: LegalOrchestrationAudit['status'], errors: LegalValidationError[] = []): LegalOrchestrationAudit {
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

  async run(accountScopeId: string, trip: Trip, callerSignal?: AbortSignal): Promise<LegalOrchestrationResult> {
    const startedAt = this.now();
    const requestId = this.requestId();
    const providerId = this.provider?.id ?? null;
    if (!accountScopeId.trim() || accountScopeId.length > 128) {
      throw new LegalOrchestrationError('invalid_input', 'Account scope is invalid.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected') });
    }
    if (trip.ownerScopeId !== accountScopeId) {
      throw new LegalOrchestrationError('access_denied', 'Trip ownership does not match the authenticated account.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected') });
    }

    let request;
    try {
      request = createLegalCheckRequest(trip);
    } catch (error) {
      throw new LegalOrchestrationError('invalid_input', 'Trip cannot produce a route-general LegalCheckRequest V1.', { audit: this.audit(requestId, trip, providerId, startedAt, 'rejected'), cause: error });
    }

    if (this.provider === null) {
      throw new LegalOrchestrationError('not_connected', 'Legal source provider is not connected.', { audit: this.audit(requestId, trip, null, startedAt, 'not_connected') });
    }
    if (callerSignal?.aborted) {
      throw new LegalOrchestrationError('aborted', 'Legal orchestration was cancelled before provider execution.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'aborted') });
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
        reject(new Error('legal-timeout'));
      }, this.timeoutMs);
    });

    const promises: Array<Promise<LegalCheckResponse>> = [
      this.provider.checkRouteRequirements(request, { accountScopeId, tripId: trip.id, locale: 'ru-RU', requestId }, controller.signal),
      timeoutPromise,
    ];
    if (callerSignal) {
      promises.push(new Promise<never>((_, reject) => {
        abortListener = () => {
          callerAborted = true;
          controller.abort(callerSignal.reason);
          reject(new Error('legal-aborted'));
        };
        callerSignal.addEventListener('abort', abortListener, { once: true });
      }));
    }

    try {
      const response = await Promise.race(promises);
      const validationErrors = validateLegalCheckResponse(response, this.provider.id, requestId);
      if (validationErrors.length > 0) {
        throw new LegalOrchestrationError('invalid_provider_response', 'Legal provider returned a response that violates the normalized contract.', {
          audit: this.audit(requestId, trip, this.provider.id, startedAt, 'invalid_provider_response', validationErrors),
          validationErrors,
        });
      }
      const completedAt = this.now();
      return {
        response,
        policies: evaluateLegalClaimPolicies(response, completedAt),
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
      if (error instanceof LegalOrchestrationError) throw error;
      if (timedOut) throw new LegalOrchestrationError('timeout', 'Legal provider exceeded the orchestration timeout.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'timeout') });
      if (callerAborted) throw new LegalOrchestrationError('aborted', 'Legal orchestration was cancelled.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'aborted') });
      throw new LegalOrchestrationError('provider_failure', 'Legal provider failed.', { audit: this.audit(requestId, trip, this.provider.id, startedAt, 'provider_failure'), cause: error });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (callerSignal && abortListener) callerSignal.removeEventListener('abort', abortListener);
    }
  }
}
