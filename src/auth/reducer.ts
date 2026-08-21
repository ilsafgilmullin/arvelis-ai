import type {
  AuthChallenge,
  AuthCodeChallenge,
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
  | { type: 'CHALLENGE_FAILURE'; intent: AuthIntent; challenge: AuthCodeChallenge; error: AuthFailure }
  | { type: 'VERIFY'; intent: AuthIntent; challenge: AuthCodeChallenge }
  | { type: 'AUTHENTICATED'; session: AuthSession }
  | { type: 'SIGN_OUT_START'; session: AuthSession }
  | { type: 'SIGN_OUT_FAILED'; session: AuthSession; error: AuthFailure }
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

function intentFromState(state: AuthUiState): AuthIntent {
  switch (state.status) {
    case 'signed_out':
    case 'submitting':
    case 'challenge':
    case 'verifying':
    case 'offline':
    case 'rate_limited':
    case 'error':
      return state.intent;
    default:
      return 'sign_in';
  }
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

    case 'CHALLENGE_FAILURE':
      return {
        status: 'challenge',
        intent: event.intent,
        challenge: event.challenge,
        error: event.error,
      };

    case 'VERIFY':
      return { status: 'verifying', intent: event.intent, challenge: event.challenge };

    case 'AUTHENTICATED':
      return { status: 'authenticated', session: event.session };

    case 'SIGN_OUT_START':
      return { status: 'signing_out', session: event.session };

    case 'SIGN_OUT_FAILED':
      return { status: 'sign_out_error', session: event.session, error: event.error };

    case 'SESSION_EXPIRED':
      return { status: 'session_expired' };

    case 'OFFLINE':
      return { status: 'offline', intent: intentFromState(state) };

    case 'FAILURE': {
      const intent = intentFromState(state);
      if (event.error.code === 'rate_limited') {
        return event.error.retryAfterSeconds === undefined
          ? { status: 'rate_limited', intent }
          : { status: 'rate_limited', intent, retryAfterSeconds: event.error.retryAfterSeconds };
      }
      return { status: 'error', intent, error: event.error };
    }

    case 'RESET':
      return signedOut(event.intent ?? intentFromState(state));

    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
