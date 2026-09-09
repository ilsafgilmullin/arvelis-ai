import { randomUUID } from 'node:crypto';
import type { Trip } from '../../src/travel/domain';
import {
  canUseClaimAsAuthoritativeFact,
  createPlanRequest,
  validatePlanProposal,
  type PlanClaim,
  type PlanProposal,
  type PlanSourceReference,
  type PlanValidationError,
} from '../../src/travel/planContracts';
import type { AIProvider } from '../../src/travel/providers';

export const DEFAULT_PLAN_PROVIDER_TIMEOUT_MS = 20_000;
export const MAX_PLAN_PROVIDER_TIMEOUT_MS = 120_000;

export type PlanOrchestrationErrorCode =
  | 'invalid_input'
  | 'access_denied'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response'
  | 'invalid_configuration';

export type PlanOrchestrationStatus =
  | 'success'
  | 'rejected'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'provider_failure'
  | 'invalid_provider_response';

export type PlanOrchestrationAudit = {
  version: 1;
  requestId: string;
  tripId: string;
  tripRevision: string;
  providerId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: PlanOrchestrationStatus;
  validationErrorCodes: PlanValidationError['code'][];
};

export type PlanPolicyEvaluation = {
  authoritativeClaimIds: string[];
  nonAuthoritativeClaimIds: string[];
  expiredSourceClaimIds: string[];
};

export type PlanOrchestrationResult = {
  proposal: PlanProposal;
  policy: PlanPolicyEvaluation;
  audit: PlanOrchestrationAudit;
};

export type PlanOrchestratorOptions = {
  provider: AIProvider | null;
  timeoutMs?: number;
  now?: () => Date;
  requestId?: () => string;
};

type PlanOrchestrationErrorDetails = {
  audit?: PlanOrchestrationAudit;
  validationErrors?: PlanValidationError[];
  cause?: unknown;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMEOUT_MARKER = Symbol('plan-provider-timeout');
const ABORT_MARKER = Symbol('plan-provider-abort');

function validScopeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value.trim() === value;
}

function validProviderId(value: string): boolean {
  return SAFE_IDENTIFIER.test(value);
}

function sourceIsCurrent(source: PlanSourceReference, nowMs: number): boolean {
  if (source.validUntil === undefined) return true;
  const validUntil = Date.parse(source.validUntil);
  return Number.isFinite(validUntil) && validUntil >= nowMs;
}

function referencedSources(claim: PlanClaim, proposal: PlanProposal): PlanSourceReference[] {
  return claim.sourceIds
    .map((id) => proposal.sources.find((source) => source.id === id))
    .filter((source): source is PlanSourceReference => source !== undefined);
}

function claimHasExpiredOnlySources(claim: PlanClaim, proposal: PlanProposal, nowMs: number): boolean {
  if (claim.provenance !== 'provider_fact' || claim.sourceIds.length === 0) return false;
  const sources = referencedSources(claim, proposal);
  return sources.length > 0 && sources.every((source) => !sourceIsCurrent(source, nowMs));
}

export function evaluatePlanPolicy(proposal: PlanProposal, now = new Date()): PlanPolicyEvaluation {
  const authoritativeClaimIds: string[] = [];
  const nonAuthoritativeClaimIds: string[] = [];
  const expiredSourceClaimIds: string[] = [];
  const nowMs = now.getTime();

  for (const claim of proposal.claims) {
    const structurallyAuthoritative = canUseClaimAsAuthoritativeFact(claim, proposal);
    const currentProviderEvidence = claim.provenance !== 'provider_fact'
      || referencedSources(claim, proposal).some((source) => sourceIsCurrent(source, nowMs));

    if (structurallyAuthoritative && currentProviderEvidence) authoritativeClaimIds.push(claim.id);
    else nonAuthoritativeClaimIds.push(claim.id);

    if (claimHasExpiredOnlySources(claim, proposal, nowMs)) expiredSourceClaimIds.push(claim.id);
  }

  return { authoritativeClaimIds, nonAuthoritativeClaimIds, expiredSourceClaimIds };
}

export class PlanOrchestrationError extends Error {
  readonly code: PlanOrchestrationErrorCode;
  readonly audit?: PlanOrchestrationAudit;
  readonly validationErrors?: PlanValidationError[];

  constructor(code: PlanOrchestrationErrorCode, message: string, details: PlanOrchestrationErrorDetails = {}) {
    super(message);
    this.name = 'PlanOrchestrationError';
    this.code = code;
    if (details.audit !== undefined) this.audit = details.audit;
    if (details.validationErrors !== undefined) this.validationErrors = details.validationErrors;
    if (details.cause !== undefined) Object.defineProperty(this, 'cause', { value: details.cause, enumerable: false });
  }
}

export class PlanOrchestrator {
  private readonly provider: AIProvider | null;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly requestId: () => string;

  constructor(options: PlanOrchestratorOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_PLAN_PROVIDER_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_PLAN_PROVIDER_TIMEOUT_MS) {
      throw new PlanOrchestrationError('invalid_configuration', 'Plan provider timeout is outside the supported range.');
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
    status: PlanOrchestrationStatus,
    validationErrors: PlanValidationError[] = [],
  ): PlanOrchestrationAudit {
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

  async run(
    accountScopeId: string,
    trip: Trip,
    userPrompt?: string,
    callerSignal?: AbortSignal,
  ): Promise<PlanOrchestrationResult> {
    const startedAt = this.now();
    const requestId = this.requestId();
    const providerId = this.provider?.id ?? null;

    if (!validScopeId(accountScopeId)) {
      throw new PlanOrchestrationError('invalid_input', 'Account scope is invalid.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
      });
    }
    if (trip.ownerScopeId !== accountScopeId) {
      throw new PlanOrchestrationError('access_denied', 'Trip ownership does not match the authenticated account.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
      });
    }
    if (!validProviderId(requestId)) {
      throw new PlanOrchestrationError('invalid_configuration', 'Plan request ID is invalid.');
    }

    let request;
    try {
      request = createPlanRequest(trip, userPrompt);
    } catch (error) {
      throw new PlanOrchestrationError('invalid_input', 'Plan request violates the contract.', {
        audit: this.createAudit(requestId, trip, providerId, startedAt, 'rejected'),
        cause: error,
      });
    }

    if (this.provider === null) {
      throw new PlanOrchestrationError('not_connected', 'AI plan provider is not connected.', {
        audit: this.createAudit(requestId, trip, null, startedAt, 'not_connected'),
      });
    }
    if (!validProviderId(this.provider.id)) {
      throw new PlanOrchestrationError('invalid_configuration', 'AI provider ID is invalid.');
    }
    if (callerSignal?.aborted) {
      throw new PlanOrchestrationError('aborted', 'Plan orchestration was cancelled before provider execution.', {
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

    const promises: Array<Promise<PlanProposal>> = [
      this.provider.planTrip(request, {
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
      const proposal = await Promise.race(promises);
      const validationErrors = validatePlanProposal(proposal, trip.id);
      if (validationErrors.length > 0) {
        throw new PlanOrchestrationError('invalid_provider_response', 'AI provider returned a Plan proposal that violates the contract.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'invalid_provider_response', validationErrors),
          validationErrors,
        });
      }

      const evaluatedAt = this.now();
      return {
        proposal,
        policy: evaluatePlanPolicy(proposal, evaluatedAt),
        audit: {
          version: 1,
          requestId,
          tripId: trip.id,
          tripRevision: trip.updatedAt,
          providerId: this.provider.id,
          startedAt: startedAt.toISOString(),
          completedAt: evaluatedAt.toISOString(),
          durationMs: Math.max(0, evaluatedAt.getTime() - startedAt.getTime()),
          status: 'success',
          validationErrorCodes: [],
        },
      };
    } catch (error) {
      if (error instanceof PlanOrchestrationError) throw error;
      if (error === TIMEOUT_MARKER || timedOut) {
        throw new PlanOrchestrationError('timeout', 'AI plan provider exceeded the orchestration timeout.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'timeout'),
        });
      }
      if (error === ABORT_MARKER || callerAborted) {
        throw new PlanOrchestrationError('aborted', 'Plan orchestration was cancelled.', {
          audit: this.createAudit(requestId, trip, this.provider.id, startedAt, 'aborted'),
        });
      }
      throw new PlanOrchestrationError('provider_failure', 'AI plan provider failed.', {
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
