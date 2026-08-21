import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AuthChallenge,
  AuthCompleteRequest,
  AuthFailure,
  AuthGateway,
  AuthIntent,
  AuthMethodDescriptor,
  AuthResourceStatus,
  AuthSessionSummary,
  AuthStartRequest,
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

export function useAuthController(gateway: AuthGateway | null) {
  const [state, dispatch] = useReducer(authUiReducer, initialAuthUiState);
  const [methods, setMethods] = useState<AuthMethodDescriptor[]>([]);
  const [methodsStatus, setMethodsStatus] = useState<AuthResourceStatus>('idle');
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsStatus, setSessionsStatus] = useState<AuthResourceStatus>('idle');

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
    const sequence = ++authSequenceRef.current;
    dispatch({ type: 'CHECK_SESSION' });

    // Method discovery is intentionally independent from session restoration.
    // A temporary provider/catalog failure must not invalidate a still-valid
    // ARVELIS server session.
    void refreshMethods();

    if (!gateway) {
      dispatch({ type: 'SESSION_RESTORED', session: null });
      return false;
    }

    try {
      const session = await gateway.restoreSession();
      if (sequence !== authSequenceRef.current) return false;

      dispatch({ type: 'SESSION_RESTORED', session });
      return Boolean(session);
    } catch {
      if (sequence !== authSequenceRef.current) return false;

      dispatch({ type: 'FAILURE', error: unexpectedFailure() });
      return false;
    }
  }, [gateway, refreshMethods]);

  useEffect(() => {
    void restore();
    return invalidatePending;
  }, [invalidatePending, restore]);

  const setIntent = useCallback((intent: AuthIntent) => {
    authSequenceRef.current += 1;
    dispatch({ type: 'SET_INTENT', intent });
  }, []);

  const start = useCallback(async (request: AuthStartRequest): Promise<AuthChallenge | null> => {
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
    if (!gateway) {
      dispatch({ type: 'FAILURE', error: { code: 'service_unavailable', message: 'Auth backend is not connected' } });
      return false;
    }

    if (state.status !== 'challenge'
      || state.challenge.kind !== 'code'
      || state.challenge.id !== request.challengeId) {
      dispatch({ type: 'FAILURE', error: invalidChallengeFailure() });
      return false;
    }

    const activeChallenge = state.challenge;
    const activeIntent = state.intent;
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
  }, [gateway, state]);

  const stateHasLiveSession = state.status === 'authenticated' || state.status === 'sign_out_error';

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
    const activeSession = state.status === 'authenticated' || state.status === 'sign_out_error'
      ? state.session
      : null;

    if (!activeSession) return false;

    const sequence = ++authSequenceRef.current;
    sessionsSequenceRef.current += 1;
    dispatch({ type: 'SIGN_OUT_START', session: activeSession });

    if (!gateway) {
      setSessions([]);
      setSessionsStatus('idle');
      dispatch({ type: 'RESET', intent: 'sign_in' });
      return true;
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
  }, [gateway, state]);

  const revokeSession = useCallback(async (sessionId: string) => {
    if (!gateway || !sessionId || !stateHasLiveSession) return false;

    try {
      await gateway.revokeSession(sessionId);
      await loadSessions();
      return true;
    } catch {
      return false;
    }
  }, [gateway, loadSessions, stateHasLiveSession]);

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
    start,
    complete,
    loadSessions,
    signOut,
    revokeSession,
    expireSession,
  } as const;
}
