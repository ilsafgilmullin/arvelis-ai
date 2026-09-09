import {
  AI_TOOL_CATALOG,
  type AiEvidence,
  type AiFactDomain,
  type AiToolCall,
  type AiToolDescriptor,
  type AiToolId,
} from '../../src/travel/aiKnowledgeContracts';
import type { AiToolExecutionContext, AiToolHandler, AiToolRegistration } from './aiEnginePorts';

export type AiToolRegistryErrorCode =
  | 'tool_not_connected'
  | 'trip_required'
  | 'invalid_tool_input'
  | 'invalid_tool_output'
  | 'tool_failure';

export class AiToolRegistryError extends Error {
  readonly code: AiToolRegistryErrorCode;

  constructor(code: AiToolRegistryErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message);
    this.name = 'AiToolRegistryError';
    this.code = code;
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
    const descriptor = this.descriptors.get(call.toolId);
    const handler = this.handlers.get(call.toolId);
    if (!descriptor || !handler) throw new AiToolRegistryError('tool_not_connected', `AI tool is not connected: ${call.toolId}`);
    if (descriptor.requiresTrip && context.authorizedTripId === undefined) {
      throw new AiToolRegistryError('trip_required', `AI tool requires an already-authorized Trip: ${call.toolId}`);
    }
    if (!validId(call.id) || !isPlainRecord(call.input) || JSON.stringify(call.input).length > 8_000) {
      throw new AiToolRegistryError('invalid_tool_input', `AI tool input is invalid: ${call.toolId}`);
    }

    let result;
    try {
      result = await handler(call.input, context, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new AiToolRegistryError('tool_failure', `AI tool execution failed: ${call.toolId}`, { cause: error });
    }

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
      if (item.sourceUrl !== undefined && !validHttpsUrl(item.sourceUrl)) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence URL must be HTTPS: ${call.toolId}`);
      if (item.retrievedAt !== undefined && !Number.isFinite(Date.parse(item.retrievedAt))) throw new AiToolRegistryError('invalid_tool_output', `AI tool evidence retrievedAt is invalid: ${call.toolId}`);
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
