export type ChatRateLimitScope = 'create' | 'mutation';

export type ChatRateLimitRequest = {
  scope: ChatRateLimitScope;
  accountId: string;
  limit: number;
  windowMs: number;
  now: number;
};

export type ChatRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export interface ChatRateLimitStore {
  consume(request: ChatRateLimitRequest): Promise<ChatRateLimitDecision>;
}

export const CHAT_CREATE_RATE_LIMIT = {
  limit: 20,
  windowMs: 10 * 60 * 1000,
} as const;

export const CHAT_MUTATION_RATE_LIMIT = {
  limit: 120,
  windowMs: 10 * 60 * 1000,
} as const;

export class ChatRateLimiter {
  constructor(
    private readonly store: ChatRateLimitStore,
    private readonly now: () => number = Date.now,
  ) {}

  consume(scope: ChatRateLimitScope, accountId: string): Promise<ChatRateLimitDecision> {
    const policy = scope === 'create' ? CHAT_CREATE_RATE_LIMIT : CHAT_MUTATION_RATE_LIMIT;
    return this.store.consume({
      scope,
      accountId,
      limit: policy.limit,
      windowMs: policy.windowMs,
      now: this.now(),
    });
  }
}
