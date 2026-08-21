export type AuthIntent = 'sign_in' | 'sign_up';

export type AuthResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Executable v1 auth capabilities only.
 * Passkeys/WebAuthn remain an architectural candidate until a dedicated
 * browser/native request-response contract is approved and implemented.
 */
export type AuthMethodKind = 'identifier' | 'external';

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

export type AuthCodeChallenge = {
  id: string;
  methodId: string;
  kind: 'code';
  maskedDestination?: string;
  expiresAt?: string;
};

export type AuthExternalRedirectChallenge = {
  id: string;
  methodId: string;
  kind: 'external_redirect';
  redirectUrl: string;
  expiresAt?: string;
};

export type AuthChallenge = AuthCodeChallenge | AuthExternalRedirectChallenge;

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

/**
 * v1 completion is only for a first-party code challenge.
 * External OAuth/OIDC callbacks are handled by the trusted ARVELIS backend;
 * after returning to the app the client restores its ARVELIS server session.
 */
export type AuthCompleteRequest = {
  challengeId: string;
  response: string;
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
  | { status: 'challenge'; intent: AuthIntent; challenge: AuthChallenge; error?: AuthFailure }
  | { status: 'verifying'; intent: AuthIntent; challenge: AuthCodeChallenge }
  | { status: 'authenticated'; session: AuthSession }
  | { status: 'signing_out'; session: AuthSession }
  | { status: 'sign_out_error'; session: AuthSession; error: AuthFailure }
  | { status: 'session_expired' }
  | { status: 'offline' }
  | { status: 'rate_limited'; retryAfterSeconds?: number }
  | { status: 'error'; error: AuthFailure };
