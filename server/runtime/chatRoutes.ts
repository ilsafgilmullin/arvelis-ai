import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  ChatAttachmentRecord,
  ChatConversationRecord,
  ChatConversationSummaryRecord,
  ChatMessageRecord,
} from '../chat/contracts';
import type { ChatRateLimitScope } from '../chat/rateLimit';
import { ChatRateLimiter } from '../chat/rateLimit';
import type { ChatApplicationService, ChatServiceFailure } from '../chat/service';
import { readJsonObject, sendJson, sendNoContent } from './http';

type ChatAuthentication =
  | { kind: 'authenticated'; accountId: string }
  | { kind: 'signed_out' | 'invalid' }
  | { kind: 'unavailable' };

type ChatRouteContext = {
  method: string;
  url: URL;
  request: IncomingMessage;
  response: ServerResponse;
  chat: ChatApplicationService;
  rateLimiter: ChatRateLimiter;
  authenticate: (request: IncomingMessage) => Promise<ChatAuthentication>;
};

function errorBody(code: string, message: string, retryAfterSeconds?: number) {
  return retryAfterSeconds === undefined
    ? { error: { code, message } }
    : { error: { code, message, retryAfterSeconds } };
}

function publicConversation(record: ChatConversationRecord) {
  return {
    id: record.id,
    title: record.title,
    modelPreference: record.modelPreference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
  };
}

function publicSummary(record: ChatConversationSummaryRecord) {
  return {
    ...publicConversation(record),
    messageCount: record.messageCount,
    latestMessageContent: record.latestMessageContent,
    latestAttachmentKind: record.latestAttachmentKind,
  };
}

function publicAttachment(record: ChatAttachmentRecord) {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    mimeType: record.mimeType,
    size: record.sizeBytes,
    durationMs: record.durationMs,
    storageState: record.storageState,
    createdAt: record.createdAt,
  };
}

function publicMessage(record: ChatMessageRecord) {
  return {
    id: record.id,
    role: record.role,
    status: record.status,
    content: record.content,
    position: record.position,
    createdAt: record.createdAt,
    editedAt: record.editedAt,
    attachments: record.attachments.map(publicAttachment),
  };
}

function parseOptionalPositiveInteger(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function sendServiceFailure(response: ServerResponse, failure: ChatServiceFailure): void {
  switch (failure.code) {
    case 'invalid_input':
      sendJson(response, 400, errorBody('invalid_input', 'Invalid chat request'));
      return;
    case 'not_found':
      sendJson(response, 404, errorBody('not_found', 'Conversation not found'));
      return;
    case 'conversation_limit':
      sendJson(response, 409, errorBody('conversation_limit', 'Conversation limit reached'));
      return;
    case 'message_limit':
      sendJson(response, 409, errorBody('message_limit', 'Message limit reached'));
      return;
    case 'conflict':
      sendJson(response, 409, errorBody('conflict', 'Chat data conflict'));
      return;
    case 'service_unavailable':
    default:
      sendJson(response, 503, errorBody('service_unavailable', 'Chat service unavailable'));
  }
}

async function requireAccount(
  request: IncomingMessage,
  response: ServerResponse,
  authenticate: ChatRouteContext['authenticate'],
): Promise<string | null> {
  const current = await authenticate(request);
  if (current.kind === 'authenticated') return current.accountId;
  if (current.kind === 'unavailable') {
    sendJson(response, 503, errorBody('service_unavailable', 'Authentication service unavailable'));
  } else {
    sendJson(response, 401, errorBody('authentication_required', 'Authentication required'));
  }
  return null;
}

async function allowMutation(
  scope: ChatRateLimitScope,
  accountId: string,
  response: ServerResponse,
  rateLimiter: ChatRateLimiter,
): Promise<boolean> {
  try {
    const decision = await rateLimiter.consume(scope, accountId);
    if (decision.allowed) return true;
    const retryAfterSeconds = Math.max(1, decision.retryAfterSeconds ?? 1);
    sendJson(
      response,
      429,
      errorBody('rate_limited', 'Too many chat changes', retryAfterSeconds),
      { 'Retry-After': String(retryAfterSeconds) },
    );
    return false;
  } catch {
    sendJson(response, 503, errorBody('service_unavailable', 'Chat protection unavailable'));
    return false;
  }
}

function containsUnsupportedAttachments(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, 'attachments');
}

export async function handleChatRoute(context: ChatRouteContext): Promise<boolean> {
  const { method, url, request, response, chat, rateLimiter, authenticate } = context;
  if (!url.pathname.startsWith('/api/chat/')) return false;

  const accountId = await requireAccount(request, response, authenticate);
  if (!accountId) return true;

  if (method === 'GET' && url.pathname === '/api/chat/conversations') {
    const limit = parseOptionalPositiveInteger(url.searchParams.get('limit'));
    if (limit === null) {
      sendJson(response, 400, errorBody('invalid_input', 'Invalid pagination limit'));
      return true;
    }
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const result = await chat.listConversations(accountId, {
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (!result.ok) {
      sendServiceFailure(response, result);
      return true;
    }
    sendJson(response, 200, {
      items: result.page.items.map(publicSummary),
      nextCursor: result.page.nextCursor,
    });
    return true;
  }

  if (method === 'POST' && url.pathname === '/api/chat/conversations') {
    if (!(await allowMutation('create', accountId, response, rateLimiter))) return true;
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request);
    } catch {
      sendJson(response, 400, errorBody('invalid_input', 'Invalid request body'));
      return true;
    }
    if (containsUnsupportedAttachments(body)) {
      sendJson(response, 409, errorBody('attachments_not_ready', 'Server attachment upload is not enabled yet'));
      return true;
    }
    if (typeof body.content !== 'string') {
      sendJson(response, 400, errorBody('invalid_input', 'Message content is required'));
      return true;
    }
    const result = await chat.createConversation(accountId, body.content);
    if (!result.ok) {
      sendServiceFailure(response, result);
      return true;
    }
    sendJson(response, 201, {
      conversation: publicConversation(result.conversation),
      message: publicMessage(result.message),
    });
    return true;
  }

  const conversationMatch = /^\/api\/chat\/conversations\/([a-f0-9]{32})$/.exec(url.pathname);
  if (conversationMatch?.[1]) {
    const conversationId = conversationMatch[1];
    if (method === 'GET') {
      const messageLimit = parseOptionalPositiveInteger(url.searchParams.get('messageLimit'));
      if (messageLimit === null) {
        sendJson(response, 400, errorBody('invalid_input', 'Invalid message pagination limit'));
        return true;
      }
      const messageCursor = url.searchParams.get('messageCursor') ?? undefined;
      const result = await chat.getConversation(accountId, conversationId, {
        ...(messageLimit === undefined ? {} : { messageLimit }),
        ...(messageCursor === undefined ? {} : { messageCursor }),
      });
      if (!result.ok) {
        sendServiceFailure(response, result);
        return true;
      }
      sendJson(response, 200, {
        conversation: publicConversation(result.page.conversation),
        messages: result.page.messages.map(publicMessage),
        nextMessageCursor: result.page.nextMessageCursor,
      });
      return true;
    }

    if (method === 'PATCH') {
      if (!(await allowMutation('mutation', accountId, response, rateLimiter))) return true;
      let body: Record<string, unknown>;
      try {
        body = await readJsonObject(request);
      } catch {
        sendJson(response, 400, errorBody('invalid_input', 'Invalid request body'));
        return true;
      }
      if (typeof body.title !== 'string') {
        sendJson(response, 400, errorBody('invalid_input', 'Conversation title is required'));
        return true;
      }
      const result = await chat.renameConversation(accountId, conversationId, body.title);
      if (!result.ok) {
        sendServiceFailure(response, result);
        return true;
      }
      sendJson(response, 200, { conversation: publicConversation(result.conversation) });
      return true;
    }

    if (method === 'DELETE') {
      if (!(await allowMutation('mutation', accountId, response, rateLimiter))) return true;
      const result = await chat.deleteConversation(accountId, conversationId);
      if (!result.ok) {
        sendServiceFailure(response, result);
        return true;
      }
      sendNoContent(response);
      return true;
    }
  }

  const messageCollectionMatch = /^\/api\/chat\/conversations\/([a-f0-9]{32})\/messages$/.exec(url.pathname);
  if (method === 'POST' && messageCollectionMatch?.[1]) {
    if (!(await allowMutation('mutation', accountId, response, rateLimiter))) return true;
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request);
    } catch {
      sendJson(response, 400, errorBody('invalid_input', 'Invalid request body'));
      return true;
    }
    if (containsUnsupportedAttachments(body)) {
      sendJson(response, 409, errorBody('attachments_not_ready', 'Server attachment upload is not enabled yet'));
      return true;
    }
    if (typeof body.content !== 'string') {
      sendJson(response, 400, errorBody('invalid_input', 'Message content is required'));
      return true;
    }
    const result = await chat.appendUserMessage(accountId, messageCollectionMatch[1], body.content);
    if (!result.ok) {
      sendServiceFailure(response, result);
      return true;
    }
    sendJson(response, 201, {
      conversation: publicConversation(result.conversation),
      message: publicMessage(result.message),
    });
    return true;
  }

  const messageMatch = /^\/api\/chat\/conversations\/([a-f0-9]{32})\/messages\/([a-f0-9]{32})$/.exec(url.pathname);
  if (method === 'PATCH' && messageMatch?.[1] && messageMatch[2]) {
    if (!(await allowMutation('mutation', accountId, response, rateLimiter))) return true;
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request);
    } catch {
      sendJson(response, 400, errorBody('invalid_input', 'Invalid request body'));
      return true;
    }
    if (typeof body.content !== 'string') {
      sendJson(response, 400, errorBody('invalid_input', 'Message content is required'));
      return true;
    }
    const result = await chat.updateUserMessage(accountId, messageMatch[1], messageMatch[2], body.content);
    if (!result.ok) {
      sendServiceFailure(response, result);
      return true;
    }
    sendJson(response, 200, {
      conversation: publicConversation(result.conversation),
      message: publicMessage(result.message),
    });
    return true;
  }

  sendJson(response, 404, errorBody('not_found', 'Chat route not found'));
  return true;
}
