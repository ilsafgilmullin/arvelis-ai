import type {
  AuthChallenge,
  AuthFailure,
  AuthIntent,
  AuthSession,
  AuthUiState,
} from './contracts';

export type AuthUiEvent =
  | { type: 'CHECK_SESSION' }
  | { type: 'SESSION_RESTORED'; session: AuthSession | null; intent?: AuthIntent }
  | { type: 'SET_INTENT'; intent: AuthIntent }
  | { type: 'SUBMIT'; intent: AuthIntent; methodId: string }
  | { type: 'CHALLENGE'; intent: AuthIntent; challenge: AuthChallenge }
  | { type: 'AUTHENTICATED'; session: AuthSession }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'OFFLINE' }
  | { type: 'FAILURE'; error: AuthFailure }
  | { type: 'RESET'; intent?: AuthIntent };

export const initialAuthUiState: AuthUiState = {
  status: 'checking_session',
};

function signedOut(intent: AuthIntent = 'sign_in'): AuthUiState {
  return { status: 'signed_out', intent };
}

export function authUiReducer(state: AuthUiState, event: AuthUiEvent): AuthUiState {
  switch (event.type) {
    case 'CHECK_SESSION':
      return { status: 'checking_session' };

    case 'SESSION_RESTORED':
      return event.session
        ? { status: 'authenticated', session: event.session }
        : signedOut(event.intent ?? 'sign_in');

    case 'SET_INTENT':
      return signedOut(event.intent);

    case 'SUBMIT':
      return { status: 'submitting', intent: event.intent, methodId: event.methodId };

    case 'CHALLENGE':
      return { status: 'challenge', intent: event.intent, challenge: event.challenge };

    case 'AUTHENTICATED':
      return { status: 'authenticated', session: event.session };

    case 'SESSION_EXPIRED':
      return { status: 'session_expired' };

    case 'OFFLINE':
      return { status: 'offline' };

    case 'FAILURE':
      if (event.error.code === 'rate_limited') {
        return { status: 'rate_limited', retryAfterSeconds: event.error.retryAfterSeconds };
      }
      return { status: 'error', error: event.error };

    case 'RESET':
      return signedOut(event.intent ?? (state.status === 'signed_out' ? state.intent : 'sign_in'));

    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
