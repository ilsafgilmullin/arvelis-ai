import {
  AI_TOOL_CATALOG,
  type AiEvidence,
  type AiFactDomain,
  type AiToolCall,
  type AiToolDescriptor,
  type AiToolId,
} from '../../src/travel/aiKnowledgeContracts';
import type { AiToolExecutionContext, AiToolHandler, AiToolRegistration } from './aiEnginePorts';
import { isSafeTransportJson, transportSearchCompleteness, validateTransportSearchRequestV1 } from '../../src/travel/transportSearchRequest';
import { TransportSearchError, type TransportSearchOutcome } from './transportSearchService';

export type AiToolRegistryErrorCode =
  | 'tool_not_connected'
  | 'trip_required'
  | 'invalid_tool_input'
  | 'invalid_tool_output'
  | 'transport_search_outcome'
  | 'tool_failure';

export class AiToolRegistryError extends Error {
  readonly code: AiToolRegistryErrorCode;
  readonly transportOutcome?: TransportSearchOutcome;

  constructor(code: AiToolRegistryErrorCode, message: string, options: { cause?: unknown; transportOutcome?: TransportSearchOutcome } = {}) {
    super(message);
    this.name = 'AiToolRegistryError';
    this.code = code;
    if (options.transportOutcome) this.transportOutcome = options.transportOutcome;
    if (options.cause !== undefined) Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false });
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}

function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class AiToolRegistry {
  private readonly descriptors = new Map<AiToolId, AiToolDescriptor>(AI_TOOL_CATALOG.map((descriptor) => [descriptor.id, descriptor]));
  private readonly handlers = new Map<AiToolId, AiToolHandler>();

  constructor(registrations: readonly AiToolRegistration[] = []) {
    for (const registration of registrations) {
      if (!this.descriptors.has(registration.id)) throw new AiToolRegistryError('invalid_tool_input', `Unknown AI tool registration: ${registration.id}`);
      if (this.handlers.has(registration.id)) throw new AiToolRegistryError('invalid_tool_input', `Duplicate AI tool registration: ${registration.id}`);
      this.handlers.set(registration.id, registration.handler);
    }
  }

  listConnectedTools(): AiToolDescriptor[] {
    return AI_TOOL_CATALOG.filter((descriptor) => this.handlers.has(descriptor.id)).map((descriptor) => ({
      ...descriptor,
      allowedDomains: [...descriptor.allowedDomains],
    }));
  }

  isConnected(id: AiToolId): boolean {
    return this.handlers.has(id);
  }

  async execute(call: AiToolCall, context: AiToolExecutionContext, signal: AbortSignal): Promise<AiEvidence[]> {
    if (signal.aborted) throw new DOMException('Tool execution cancelled.', 'AbortError');
    const descriptor = this.descriptors.get(call.toolId);
    const handler = this.handlers.get(call.toolId);
    if (!descriptor || !handler) throw new AiToolRegistryError('tool_not_connected', `AI tool is not connected: ${call.toolId}`);
    if (descriptor.requiresTrip && context.authorizedTripId === undefined) {
      throw new AiToolRegistryError('trip_required', `AI tool requires an already-authorized Trip: ${call.toolId}`);
    }
    if (!validId(call.id) || !isPlainRecord(call.input) || !isSafeTransportJson(call.input)) {
      throw new AiToolRegistryError('invalid_tool_input', `AI tool input is invalid: ${call.toolId}`);
    }
    if (call.toolId === 'transport.search') {
      const validation = validateTransportSearchRequestV1(call.input, context.now ?? new Date());
      const issues = validation.ok ? transportSearchCompleteness(validation.request) : validation.issues;
      if (issues.length) throw new AiToolRegistryError('transport_search_outcome', 'Transport search request cannot execute.', { transportOutcome: { status: 'not_executed', code: issues[0]!.code, issues } });
    }

    let result;
    try {
      result = await handler(call.input, context, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof TransportSearchError) throw new AiToolRegistryError('transport_search_outcome', error.message, { transportOutcome: error.outcome });
      throw new AiToolRegistryError('tool_failure', `AI tool execution failed: ${call.toolId}`, { cause: error });
    }
    if (result?.outcome) throw new AiToolRegistryError('transport_search_outcome', 'Transport search completed with a typed outcome.', { transportOutcome: result.outcome });

    if (!result || !Array.isArray(result.evidence) || result.evidence.length > 64) {
      throw new AiToolRegistryError('invalid_tool_output', `AI tool returned invalid evidence: ${call.toolId}`);
    }
    const allowedDomains = new Set<AiFactDomain>(descriptor.allowedDomains);
    const seen = new Set<string>();
    const normalized: AiEvidence[] = [];
    for (const [index, item] of result.evidence.entries()) {
      if (!validId(item.id) || seen.has(item.id) || !allowedDomains.has(item.domain) || !validText(item.text, 4_000)) {
        throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence is invalid at index ${index}: ${call.toolId}`);
      }
      if (!['current', 'expired', 'unknown'].includes(item.freshness)) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence freshness is invalid: ${call.toolId}`);
      if (!['official', 'provider', 'user', 'editorial'].includes(item.sourceType)) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence source type is invalid: ${call.toolId}`);
      if (item.providerId !== undefined && !validId(item.providerId)) throw new AiToolRegistryError('invalid_tool_output', 'Invalid evidence provider identity.');
      if (item.provenance && (!isSafeTransportJson(item.provenance) || item.provenance.requestId !== context.requestId || !validId(item.provenance.routeId) || !['synthetic', 'provider'].includes(item.provenance.dataKind))) throw new AiToolRegistryError('invalid_tool_output', 'Invalid evidence provenance.');
      if (item.sourceUrl !== undefined && !validHttpsUrl(item.sourceUrl)) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence URL must be HTTPS: ${call.toolId}`);
      if (item.retrievedAt !== undefined && !Number.isFinite(Date.parse(item.retrievedAt))) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence retrievedAt is invalid: ${call.toolId}`);
      if (item.expiresAt !== undefined) {
        if (!item.retrievedAt || !Number.isFinite(Date.parse(item.expiresAt)) || Date.parse(item.expiresAt) < Date.parse(item.retrievedAt)) throw new AiToolRegistryError('invalid_tool_output', 'Invalid evidence validity interval.');
        if (Date.parse(item.expiresAt) <= (context.now ?? new Date()).getTime()) item.freshness = 'expired';
      }
      seen.add(item.id);
      normalized.push({
        ...item,
        id: `tool:${call.id}:${item.id}`,
        origin: 'tool',
        toolId: call.toolId,
      });
    }
    return normalized;
  }
}
