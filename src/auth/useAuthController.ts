import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AuthChallenge,
  AuthCodeChallenge,
  AuthCompleteRequest,
  AuthFailure,
  AuthGateway,
  AuthIntent,
  AuthMethodDescriptor,
  AuthResourceStatus,
  AuthSessionSummary,
  AuthStartRequest,
  AuthUiState,
} from './contracts';
import { authUiReducer, initialAuthUiState } from './reducer';

function unexpectedFailure(): AuthFailure {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { code: 'network_error', message: 'Network unavailable' };
  }
  return { code: 'service_unavailable', message: 'Auth service unavailable' };
}

function invalidChallengeFailure(): AuthFailure {
  return { code: 'invalid_challenge', message: 'No matching active code challenge' };
}

function preservesCodeChallenge(error: AuthFailure): boolean {
  return error.code === 'invalid_input'
    || error.code === 'invalid_challenge'
    || error.code === 'rate_limited'
    || error.code === 'network_error'
    || error.code === 'service_unavailable'
    || error.code === 'unknown';
}

function hasLiveSession(state: AuthUiState): boolean {
  return state.status === 'authenticated'
    || state.status === 'signing_out'
    || state.status === 'sign_out_error';
}

function canManageSessions(state: AuthUiState): boolean {
  return state.status === 'authenticated' || state.status === 'sign_out_error';
}

export function useAuthController(gateway: AuthGateway | null) {
  const [state, dispatch] = useReducer(authUiReducer, initialAuthUiState);
  const [methods, setMethods] = useState<AuthMethodDescriptor[]>([]);
  const [methodsStatus, setMethodsStatus] = useState<AuthResourceStatus>('idle');
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<AuthResourceStatus>('idle');

  const stateRef = useRef<AuthUiState>(state);
  stateRef.current = state;

  const authSequenceRef = useRef(0);
  const methodsSequenceRef = useRef(0);
  const sessionsSequenceRef = useRef(0);

  const invalidatePending = useCallback(() => {
    authSequenceRef.current += 1;
    methodsSequenceRef.current += 1;
    sessionsSequenceRef.current += 1;
  }, []);

  const refreshMethods = useCallback(async () => {
    const sequence = ++methodsSequenceRef.current;

    if (!gateway) {
      setMethods([]);
      setMethodsStatus('idle');
      return false;
    }

    setMethodsStatus('loading');

    try {
      const availableMethods = await gateway.getMethods();
      if (sequence !== methodsSequenceRef.current) return false;

      setMethods(availableMethods.filter((method) => method.enabled));
      setMethodsStatus('ready');
      return true;
    } catch {
      if (sequence !== methodsSequenceRef.current) return false;

      setMethods([]);
      setMethodsStatus('error');
      return false;
    }
  }, [gateway]);

  const restore = useCallback(async () => {
    const stateAtStart = stateRef.current;

    // A restore request must not race a server-side logout already in flight.
    if (stateAtStart.status === 'signing_out') return false;

    const preserveLiveSession = hasLiveSession(stateAtStart);
    const sequence = ++authSequenceRef.current;

    if (!preserveLiveSession) {
      dispatch({ type: 'CHECK_SESSION' });
    }

    // Method discovery is intentionally independent from session restoration.
    // A temporary provider/catalog failure must not invalidate a still-valid
    // ARVELIS server session.
    void refreshMethods();

    if (!gateway) {
      if (!preserveLiveSession) {
        dispatch({ type: 'SESSION_RESTORED', session: null });
      }
      return false;
    }

    try {
      const session = await gateway.restoreSession();
      if (sequence !== authSequenceRef.current) return false;

      // A trusted null response is authoritative and signs the user out.
      // A transport failure below is not equivalent to a trusted null.
      dispatch({ type: 'SESSION_RESTORED', session });
      return Boolean(session);
    } catch {
      if (sequence !== authSequenceRef.current) return false;

      if (!preserveLiveSession) {
        dispatch({ type: 'FAILURE', error: unexpectedFailure() });
      }
      return false;
    }
  }, [gateway, refreshMethods]);

  useEffect(() => {
    void restore();
    return invalidatePending;
  }, [invalidatePending, restore]);

  const setIntent = useCallback((intent: AuthIntent) => {
    if (hasLiveSession(stateRef.current)) return false;

    authSequenceRef.current += 1;
    dispatch({ type: 'SET_INTENT', intent });
    return true;
  }, []);

  const resumeCodeChallenge = useCallback((intent: AuthIntent, challenge: AuthCodeChallenge) => {
    if (hasLiveSession(stateRef.current)) return false;

    authSequenceRef.current += 1;
    dispatch({ type: 'CHALLENGE', intent, challenge });
    return true;
  }, []);

  const start = useCallback(async (request: AuthStartRequest): Promise<AuthChallenge | null> => {
    if (hasLiveSession(stateRef.current)) return null;

    if (!gateway) {
      dispatch({ type: 'FAILURE', error: { code: 'service_unavailable', message: 'Auth backend is not connected' } });
      return null;
    }

    const sequence = ++authSequenceRef.current;
    dispatch({ type: 'SUBMIT', intent: request.intent, methodId: request.methodId });

    try {
      const result = await gateway.start(request);
      if (sequence !== authSequenceRef.current) return null;

      if (!result.ok) {
        dispatch({ type: 'FAILURE', error: result.error });
        return null;
      }

      dispatch({ type: 'CHALLENGE', intent: request.intent, challenge: result.challenge });
      return result.challenge;
    } catch {
      if (sequence !== authSequenceRef.current) return null;
      dispatch({ type: 'FAILURE', error: unexpectedFailure() });
      return null;
    }
  }, [gateway]);

  const complete = useCallback(async (request: AuthCompleteRequest) => {
    const currentState = stateRef.current;

    if (currentState.status !== 'challenge') {
      dispatch({ type: 'FAILURE', error: invalidChallengeFailure() });
      return false;
    }

    // External OAuth/OIDC is completed by the trusted backend callback, not
    // through the first-party code completion endpoint.
    if (currentState.challenge.kind !== 'code') return false;

    const activeChallenge = currentState.challenge;
    const activeIntent = currentState.intent;

    if (activeChallenge.id !== request.challengeId) {
      dispatch({
        type: 'CHALLENGE_FAILURE',
        intent: activeIntent,
        challenge: activeChallenge,
        error: invalidChallengeFailure(),
      });
      return false;
    }

    if (!gateway) {
      dispatch({
        type: 'CHALLENGE_FAILURE',
        intent: activeIntent,
        challenge: activeChallenge,
        error: { code: 'service_unavailable', message: 'Auth backend is not connected' },
      });
      return false;
    }

    const sequence = ++authSequenceRef.current;
    dispatch({ type: 'VERIFY', intent: activeIntent, challenge: activeChallenge });

    try {
      const result = await gateway.complete(request);
      if (sequence !== authSequenceRef.current) return false;

      if (!result.ok) {
        if (preservesCodeChallenge(result.error)) {
          dispatch({ type: 'CHALLENGE_FAILURE', intent: activeIntent, challenge: activeChallenge, error: result.error });
        } else {
          dispatch({ type: 'FAILURE', error: result.error });
        }
        return false;
      }

      dispatch({ type: 'AUTHENTICATED', session: result.session });
      return true;
    } catch {
      if (sequence !== authSequenceRef.current) return false;
      dispatch({ type: 'CHALLENGE_FAILURE', intent: activeIntent, challenge: activeChallenge, error: unexpectedFailure() });
      return false;
    }
  }, [gateway]);

  const stateHasLiveSession = canManageSessions(state);

  const loadSessions = useCallback(async () => {
    const sequence = ++sessionsSequenceRef.current;

    if (!gateway || !stateHasLiveSession) {
      setSessions([]);
      setSessionsStatus('idle');
      return false;
    }

    setSessionsStatus('loading');

    try {
      const activeSessions = await gateway.listSessions();
      if (sequence !== sessionsSequenceRef.current) return false;

      setSessions(activeSessions);
      setSessionsStatus('ready');
      return true;
    } catch {
      if (sequence !== sessionsSequenceRef.current) return false;

      setSessions([]);
      setSessionsStatus('error');
      return false;
    }
  }, [gateway, stateHasLiveSession]);

  useEffect(() => {
    if (state.status === 'authenticated') {
      void loadSessions();
      return;
    }

    if (state.status === 'signing_out' || state.status === 'sign_out_error') {
      return;
    }

    sessionsSequenceRef.current += 1;
    setSessions([]);
    setSessionsStatus('idle');
  }, [loadSessions, state.status]);

  const signOut = useCallback(async () => {
    const currentState = stateRef.current;
    const activeSession = currentState.status === 'authenticated' || currentState.status === 'sign_out_error'
      ? currentState.session
      : null;

    if (!activeSession) return false;

    const sequence = ++authSequenceRef.current;
    sessionsSequenceRef.current += 1;
    dispatch({ type: 'SIGN_OUT_START', session: activeSession });

    if (!gateway) {
      dispatch({
        type: 'SIGN_OUT_FAILED',
        session: activeSession,
        error: { code: 'service_unavailable', message: 'Auth backend is not connected' },
      });
      return false;
    }

    try {
      await gateway.signOut();
      if (sequence !== authSequenceRef.current) return false;

      setSessions([]);
      setSessionsStatus('idle');
      dispatch({ type: 'RESET', intent: 'sign_in' });
      return true;
    } catch {
      if (sequence !== authSequenceRef.current) return false;

      dispatch({ type: 'SIGN_OUT_FAILED', session: activeSession, error: unexpectedFailure() });
      return false;
    }
  }, [gateway]);

  const revokeSession = useCallback(async (sessionId: string) => {
    if (!gateway || !sessionId || !canManageSessions(stateRef.current)) return false;

    try {
      await gateway.revokeSession(sessionId);
      await loadSessions();
      return true;
    } catch {
      return false;
    }
  }, [gateway, loadSessions]);

  const expireSession = useCallback(() => {
    authSequenceRef.current += 1;
    sessionsSequenceRef.current += 1;
    setSessions([]);
    setSessionsStatus('idle');
    dispatch({ type: 'SESSION_EXPIRED' });
  }, []);

  return {
    state,
    methods,
    methodsStatus,
    sessions,
    sessionsStatus,
    restore,
    refreshMethods,
    setIntent,
    resumeCodeChallenge,
    start,
    complete,
    loadSessions,
    signOut,
    revokeSession,
    expireSession,
  } as const;
}
