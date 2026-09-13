import { randomUUID } from 'node:crypto';
import {
  evaluateAiStructuredAnswer,
  knowledgeResultToEvidence,
  validateAiGatewayRequest,
  validateAiModelTurn,
  validateAiStructuredAnswer,
  validateKnowledgeRetrievalResult,
  type AiClaimEvaluation,
  type AiEvidence,
  type AiGatewayRequest,
  type AiStructuredAnswer,
  type AiToolCall,
  type AiToolDescriptor,
  type AiValidationError,
} from '../../src/travel/aiKnowledgeContracts';
import type { AiGatewayServerContext, AiModelRuntime, KnowledgeRetriever, KnowledgeQuery } from './aiEnginePorts';
import { AiToolRegistry, AiToolRegistryError } from './aiToolRegistry';

export const DEFAULT_AI_GATEWAY_TIMEOUT_MS = 30_000;
export const MAX_AI_GATEWAY_TIMEOUT_MS = 120_000;
export const MAX_AI_TOOL_ROUNDS = 2;
export const MAX_AI_EVIDENCE_ITEMS = 128;
export const REQUIRED_TRANSPORT_TOOL_ROUTING_VERSION = 1 as const;
export const REQUIRED_TRANSPORT_TOOL_CALL_ID = 'required-transport-search-v1';

export type AiGatewayErrorCode =
  | 'invalid_input'
  | 'not_connected'
  | 'aborted'
  | 'timeout'
  | 'runtime_failure'
  | 'retrieval_failure'
  | 'invalid_retrieval_response'
  | 'tool_failure'
  | 'invalid_model_output'
  | 'invalid_configuration';

export type AiGatewayAudit = {
  version: 1;
  requestId: string;
  runtimeId: string | null;
  retrieverId: string | null;
  scope: AiGatewayRequest['scope'];
  tripId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'success' | 'rejected' | 'not_connected' | 'aborted' | 'timeout' | 'runtime_failure' | 'retrieval_failure' | 'invalid_retrieval_response' | 'tool_failure' | 'invalid_model_output';
  retrievalStatus: 'not_connected' | 'not_run' | 'success' | 'failed';
  toolCallsExecuted: number;
  evidenceCount: number;
  validationErrorCodes: AiValidationError['code'][];
};

export type AiGatewayResult = {
  answer: AiStructuredAnswer;
  evidence: AiEvidence[];
  evaluation: AiClaimEvaluation[];
  audit: AiGatewayAudit;
};

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly audit?: AiGatewayAudit;
  readonly validationErrors?: AiValidationError[];

  constructor(code: AiGatewayErrorCode, message: string, details: { audit?: AiGatewayAudit; validationErrors?: AiValidationError[]; cause?: unknown } = {}) {
    super(message);
    this.name = 'AiGatewayError';
    this.code = code;
    if (details.audit) this.audit = details.audit;
    if (details.validationErrors) this.validationErrors = details.validationErrors;
    if (details.cause !== undefined) Object.defineProperty(this, 'cause', { value: details.cause, enumerable: false });
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMEOUT_MARKER = Symbol('ai-gateway-timeout');
const ABORT_MARKER = Symbol('ai-gateway-abort');
const TRANSPORT_CONTEXT_PATTERN = /(?:билет|поезд|самол[её]т|автобус|электричк|рейс|транспорт)/iu;
const LIVE_TRANSPORT_FACT_PATTERN = /(?:цен|стоимост|расписан|отправлен|прибыт|наличи|доступн|свободн(?:ое|ые)?\s+мест)/iu;

function validScope(value: string): boolean {
  return value.length > 0 && value.length <= 128 && value.trim() === value;
}

function validId(value: string): boolean {
  return SAFE_IDENTIFIER.test(value);
}

function requiredTransportSearchCall(
  request: AiGatewayRequest,
  connectedTools: readonly AiToolDescriptor[],
  evidence: readonly AiEvidence[],
): AiToolCall | null {
  if (request.scope !== 'trip') return null;
  if (!connectedTools.some((tool) => tool.id === 'transport.search')) return null;
  if (evidence.some((item) => item.origin === 'tool' && item.toolId === 'transport.search')) return null;

  const prompt = request.prompt.toLocaleLowerCase('ru-RU');
  const explicitlyRequired = prompt.includes('transport.search') || prompt.includes('transport_search');
  const liveTransportFactRequested = TRANSPORT_CONTEXT_PATTERN.test(prompt) && LIVE_TRANSPORT_FACT_PATTERN.test(prompt);
  if (!explicitlyRequired && !liveTransportFactRequested) return null;

  return {
    id: REQUIRED_TRANSPORT_TOOL_CALL_ID,
    toolId: 'transport.search',
    input: { intent: 'required-live-transport' },
  };
}

export class AiGateway {
  private readonly runtime: AiModelRuntime | null;
  private readonly retriever: KnowledgeRetriever | null;
  private readonly tools: AiToolRegistry;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly requestId: () => string;

  constructor(options: {
    runtime: AiModelRuntime | null;
    retriever?: KnowledgeRetriever | null;
    tools?: AiToolRegistry;
    timeoutMs?: number;
    now?: () => Date;
    requestId?: () => string;
  }) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_AI_GATEWAY_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_AI_GATEWAY_TIMEOUT_MS) {
      throw new AiGatewayError('invalid_configuration', 'AI Gateway timeout is outside the supported range.');
    }
    this.runtime = options.runtime;
    this.retriever = options.retriever ?? null;
    this.tools = options.tools ?? new AiToolRegistry();
    this.timeoutMs = timeoutMs;
    this.now = options.now ?? (() => new Date());
    this.requestId = options.requestId ?? (() => randomUUID());
  }

  private audit(
    requestId: string,
    request: AiGatewayRequest,
    context: AiGatewayServerContext,
    startedAt: Date,
    status: AiGatewayAudit['status'],
    details: {
      retrievalStatus?: AiGatewayAudit['retrievalStatus'];
      toolCallsExecuted?: number;
      evidenceCount?: number;
      validationErrors?: AiValidationError[];
    } = {},
  ): AiGatewayAudit {
    const completedAt = this.now();
    return {
      version: 1,
      requestId,
      runtimeId: this.runtime?.id ?? null,
      retrieverId: this.retriever?.id ?? null,
      scope: request.scope,
      tripId: context.authorizedTripId ?? null,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      status,
      retrievalStatus: details.retrievalStatus ?? (this.retriever ? 'not_run' : 'not_connected'),
      toolCallsExecuted: details.toolCallsExecuted ?? 0,
      evidenceCount: details.evidenceCount ?? 0,
      validationErrorCodes: (details.validationErrors ?? []).map((error) => error.code),
    };
  }

  async run(request: AiGatewayRequest, context: AiGatewayServerContext, callerSignal?: AbortSignal): Promise<AiGatewayResult> {
    const startedAt = this.now();
    const requestId = this.requestId();
    const requestErrors = validateAiGatewayRequest(request);
    if (requestErrors.length > 0 || !validScope(context.accountScopeId) || !validId(requestId)) {
      throw new AiGatewayError('invalid_input', 'AI Gateway request or server context is invalid.', {
        audit: this.audit(requestId, request, context, startedAt, 'rejected', { validationErrors: requestErrors }),
        validationErrors: requestErrors,
      });
    }
    if (request.scope === 'trip' && (context.authorizedTripId === undefined || !validId(context.authorizedTripId))) {
      throw new AiGatewayError('invalid_input', 'Trip-scoped AI Gateway requires an already-authorized Trip ID.', {
        audit: this.audit(requestId, request, context, startedAt, 'rejected'),
      });
    }
    if (this.runtime === null) {
      throw new AiGatewayError('not_connected', 'AI model runtime is not connected.', {
        audit: this.audit(requestId, request, context, startedAt, 'not_connected', { retrievalStatus: this.retriever ? 'not_run' : 'not_connected' }),
      });
    }
    if (!validId(this.runtime.id) || (this.retriever !== null && !validId(this.retriever.id))) {
      throw new AiGatewayError('invalid_configuration', 'AI runtime/retriever identifier is invalid.');
    }
    if (callerSignal?.aborted) {
      throw new AiGatewayError('aborted', 'AI Gateway was cancelled before execution.', {
        audit: this.audit(requestId, request, context, startedAt, 'aborted'),
      });
    }

    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    let timedOut = false;
    let callerAborted = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort(TIMEOUT_MARKER);
        reject(TIMEOUT_MARKER);
      }, this.timeoutMs);
    });
    const abortPromise = callerSignal
      ? new Promise<never>((_, reject) => {
          abortListener = () => {
            callerAborted = true;
            controller.abort(callerSignal.reason);
            reject(ABORT_MARKER);
          };
          callerSignal.addEventListener('abort', abortListener, { once: true });
        })
      : null;

    const pipeline = async (): Promise<AiGatewayResult> => {
      const evidence: AiEvidence[] = [];
      let retrievalStatus: AiGatewayAudit['retrievalStatus'] = this.retriever ? 'not_run' : 'not_connected';
      let toolCallsExecuted = 0;

      if (this.retriever !== null) {
        const queryId = `${requestId}:knowledge`;
        const query: KnowledgeQuery = {
          version: 1,
          queryId,
          text: request.prompt,
          locale: request.locale,
          scope: request.scope,
          ...(context.authorizedTripId ? { tripId: context.authorizedTripId } : {}),
        };
        let retrieval;
        try {
          retrieval = await this.retriever.retrieve(query, {
            accountScopeId: context.accountScopeId,
            ...(context.authorizedTripId ? { authorizedTripId: context.authorizedTripId } : {}),
            requestId,
          }, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          retrievalStatus = 'failed';
          throw new AiGatewayError('retrieval_failure', 'Knowledge retriever failed.', {
            audit: this.audit(requestId, request, context, startedAt, 'retrieval_failure', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length }),
            cause: error,
          });
        }
        const retrievalErrors = validateKnowledgeRetrievalResult(retrieval, queryId);
        if (retrievalErrors.length > 0) {
          retrievalStatus = 'failed';
          throw new AiGatewayError('invalid_retrieval_response', 'Knowledge retriever returned invalid normalized output.', {
            audit: this.audit(requestId, request, context, startedAt, 'invalid_retrieval_response', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length, validationErrors: retrievalErrors }),
            validationErrors: retrievalErrors,
          });
        }
        retrievalStatus = 'success';
        evidence.push(...knowledgeResultToEvidence(retrieval, this.now()));
      }

      const connectedTools = this.tools.listConnectedTools();
      const executeToolCall = async (call: AiToolCall): Promise<void> => {
        try {
          const toolEvidence = await this.tools.execute(call, {
            accountScopeId: context.accountScopeId,
            ...(context.authorizedTripId ? { authorizedTripId: context.authorizedTripId } : {}),
            requestId,
            locale: request.locale,
          }, controller.signal);
          evidence.push(...toolEvidence);
          toolCallsExecuted += 1;
          if (evidence.length > MAX_AI_EVIDENCE_ITEMS) throw new AiToolRegistryError('invalid_tool_output', 'AI evidence budget exceeded.');
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw new AiGatewayError('tool_failure', 'AI tool execution failed.', {
            audit: this.audit(requestId, request, context, startedAt, 'tool_failure', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length }),
            cause: error,
          });
        }
      };

      const requiredTransportCall = requiredTransportSearchCall(request, connectedTools, evidence);
      if (requiredTransportCall !== null) await executeToolCall(requiredTransportCall);

      for (let round = 0; round <= MAX_AI_TOOL_ROUNDS; round += 1) {
        let turn;
        try {
          turn = await this.runtime!.generate({
            version: 1,
            requestId,
            prompt: request.prompt,
            locale: request.locale,
            scope: request.scope,
            ...(context.authorizedTripId ? { tripId: context.authorizedTripId } : {}),
            evidence: [...evidence],
            tools: connectedTools,
          }, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw new AiGatewayError('runtime_failure', 'AI model runtime failed.', {
            audit: this.audit(requestId, request, context, startedAt, 'runtime_failure', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length }),
            cause: error,
          });
        }

        const turnErrors = validateAiModelTurn(turn, requestId, connectedTools);
        if (turnErrors.length > 0) {
          throw new AiGatewayError('invalid_model_output', 'AI runtime returned an invalid structured turn.', {
            audit: this.audit(requestId, request, context, startedAt, 'invalid_model_output', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length, validationErrors: turnErrors }),
            validationErrors: turnErrors,
          });
        }

        if (turn.kind === 'tool_calls') {
          if (round >= MAX_AI_TOOL_ROUNDS) {
            throw new AiGatewayError('invalid_model_output', 'AI runtime exceeded the allowed tool-call rounds.', {
              audit: this.audit(requestId, request, context, startedAt, 'invalid_model_output', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length }),
            });
          }
          for (const call of turn.calls) await executeToolCall(call);
          continue;
        }

        const answerErrors = validateAiStructuredAnswer(turn.answer, requestId, evidence);
        if (answerErrors.length > 0) {
          throw new AiGatewayError('invalid_model_output', 'AI answer violates structured-output/evidence policy.', {
            audit: this.audit(requestId, request, context, startedAt, 'invalid_model_output', { retrievalStatus, toolCallsExecuted, evidenceCount: evidence.length, validationErrors: answerErrors }),
            validationErrors: answerErrors,
          });
        }
        const completedAt = this.now();
        return {
          answer: turn.answer,
          evidence,
          evaluation: evaluateAiStructuredAnswer(turn.answer, evidence),
          audit: {
            version: 1,
            requestId,
            runtimeId: this.runtime!.id,
            retrieverId: this.retriever?.id ?? null,
            scope: request.scope,
            tripId: context.authorizedTripId ?? null,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
            status: 'success',
            retrievalStatus,
            toolCallsExecuted,
            evidenceCount: evidence.length,
            validationErrorCodes: [],
          },
        };
      }
      throw new AiGatewayError('invalid_model_output', 'AI runtime did not produce an answer within the bounded tool loop.');
    };

    const promises: Array<Promise<AiGatewayResult>> = [pipeline(), timeoutPromise];
    if (abortPromise) promises.push(abortPromise);

    try {
      return await Promise.race(promises);
    } catch (error) {
      if (error instanceof AiGatewayError) throw error;
      if (timedOut || error === TIMEOUT_MARKER) {
        throw new AiGatewayError('timeout', 'AI Gateway exceeded the orchestration timeout.', {
          audit: this.audit(requestId, request, context, startedAt, 'timeout'),
        });
      }
      if (callerAborted || error === ABORT_MARKER) {
        throw new AiGatewayError('aborted', 'AI Gateway was cancelled.', {
          audit: this.audit(requestId, request, context, startedAt, 'aborted'),
        });
      }
      throw new AiGatewayError('runtime_failure', 'AI Gateway failed.', {
        audit: this.audit(requestId, request, context, startedAt, 'runtime_failure'),
        cause: error,
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (callerSignal && abortListener) callerSignal.removeEventListener('abort', abortListener);
    }
  }
}
