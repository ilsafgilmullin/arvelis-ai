export type AuthIntent = 'sign_in' | 'sign_up';

export type AuthMethodKind = 'identifier' | 'external' | 'passkey';

export type AuthMethodDescriptor = {
  id: string;
  kind: AuthMethodKind;
  label: string;
  enabled: boolean;
  identifierType?: 'email' | 'phone';
};

export type AuthAccount = {
  id: string;
  displayName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type AuthSession = {
  id: string;
  account: AuthAccount;
  createdAt: string;
  expiresAt: string;
};

export type AuthSessionSummary = {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt?: string;
  expiresAt: string;
  deviceLabel?: string;
  browserLabel?: string;
};

export type AuthChallenge = {
  id: string;
  methodId: string;
  kind: 'code' | 'external_redirect' | 'passkey';
  maskedDestination?: string;
  expiresAt?: string;
  redirectUrl?: string;
};

export type AuthFailureCode =
  | 'invalid_input'
  | 'invalid_challenge'
  | 'challenge_expired'
  | 'rate_limited'
  | 'account_locked'
  | 'network_error'
  | 'service_unavailable'
  | 'access_denied'
  | 'unknown';

export type AuthFailure = {
  code: AuthFailureCode;
  message: string;
  retryAfterSeconds?: number;
};

export type AuthStartRequest = {
  intent: AuthIntent;
  methodId: string;
  identifier?: string;
};

export type AuthCompleteRequest = {
  challengeId: string;
  response?: string;
};

export type AuthStartResult =
  | { ok: true; challenge: AuthChallenge }
  | { ok: false; error: AuthFailure };

export type AuthCompleteResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: AuthFailure };

/**
 * Provider-independent frontend port.
 *
 * Production implementation must call a trusted ARVELIS backend. It must not
 * store provider secrets or make frontend roles authoritative.
 */
export interface AuthGateway {
  getMethods(): Promise<AuthMethodDescriptor[]>;
  restoreSession(): Promise<AuthSession | null>;
  start(request: AuthStartRequest): Promise<AuthStartResult>;
  complete(request: AuthCompleteRequest): Promise<AuthCompleteResult>;
  signOut(): Promise<void>;
  listSessions(): Promise<AuthSessionSummary[]>;
  revokeSession(sessionId: string): Promise<void>;
}

export type AuthUiState =
  | { status: 'checking_session' }
  | { status: 'signed_out'; intent: AuthIntent }
  | { status: 'submitting'; intent: AuthIntent; methodId: string }
  | { status: 'challenge'; intent: AuthIntent; challenge: AuthChallenge }
  | { status: 'authenticated'; session: AuthSession }
  | { status: 'session_expired' }
  | { status: 'offline' }
  | { status: 'rate_limited'; retryAfterSeconds?: number }
  | { status: 'error'; error: AuthFailure };
