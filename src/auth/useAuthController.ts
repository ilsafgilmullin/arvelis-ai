import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AuthCompleteRequest,
  AuthFailure,
  AuthGateway,
  AuthIntent,
  AuthMethodDescriptor,
  AuthStartRequest,
} from './contracts';
import { authUiReducer, initialAuthUiState } from './reducer';

function unexpectedFailure(): AuthFailure {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { code: 'network_error', message: 'Network unavailable' };
  }
  return { code: 'service_unavailable', message: 'Auth service unavailable' };
}

export function useAuthController(gateway: AuthGateway | null) {
  const [state, dispatch] = useReducer(authUiReducer, initialAuthUiState);
  const [methods, setMethods] = useState<AuthMethodDescriptor[]>([]);
  const sequenceRef = useRef(0);

  const invalidatePending = useCallback(() => {
    sequenceRef.current += 1;
  }, []);

  const restore = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    dispatch({ type: 'CHECK_SESSION' });

    if (!gateway) {
      setMethods([]);
      dispatch({ type: 'SESSION_RESTORED', session: null });
      return;
    }

    try {
      const [availableMethods, session] = await Promise.all([
        gateway.getMethods(),
        gateway.restoreSession(),
      ]);
      if (sequence !== sequenceRef.current) return;

      setMethods(availableMethods.filter((method) => method.enabled));
      dispatch({ type: 'SESSION_RESTORED', session });
    } catch {
      if (sequence !== sequenceRef.current) return;
      setMethods([]);
      dispatch({ type: 'FAILURE', error: unexpectedFailure() });
    }
  }, [gateway]);

  useEffect(() => {
    void restore();
    return invalidatePending;
  }, [invalidatePending, restore]);

  const setIntent = useCallback((intent: AuthIntent) => {
    invalidatePending();
    dispatch({ type: 'SET_INTENT', intent });
  }, [invalidatePending]);

  const start = useCallback(async (request: AuthStartRequest) => {
    if (!gateway) {
      dispatch({ type: 'FAILURE', error: { code: 'service_unavailable', message: 'Auth backend is not connected' } });
      return false;
    }

    const sequence = ++sequenceRef.current;
    dispatch({ type: 'SUBMIT', intent: request.intent, methodId: request.methodId });

    try {
      const result = await gateway.start(request);
      if (sequence !== sequenceRef.current) return false;

      if (!result.ok) {
        dispatch({ type: 'FAILURE', error: result.error });
        return false;
      }

      dispatch({ type: 'CHALLENGE', intent: request.intent, challenge: result.challenge });
      return true;
    } catch {
      if (sequence !== sequenceRef.current) return false;
      dispatch({ type: 'FAILURE', error: unexpectedFailure() });
      return false;
    }
  }, [gateway]);

  const complete = useCallback(async (request: AuthCompleteRequest) => {
    if (!gateway) {
      dispatch({ type: 'FAILURE', error: { code: 'service_unavailable', message: 'Auth backend is not connected' } });
      return false;
    }

    const sequence = ++sequenceRef.current;

    try {
      const result = await gateway.complete(request);
      if (sequence !== sequenceRef.current) return false;

      if (!result.ok) {
        dispatch({ type: 'FAILURE', error: result.error });
        return false;
      }

      dispatch({ type: 'AUTHENTICATED', session: result.session });
      return true;
    } catch {
      if (sequence !== sequenceRef.current) return false;
      dispatch({ type: 'FAILURE', error: unexpectedFailure() });
      return false;
    }
  }, [gateway]);

  const signOut = useCallback(async () => {
    invalidatePending();

    if (gateway) {
      try {
        await gateway.signOut();
      } catch {
        // Sign-out UX remains safe and local even if server cleanup fails.
        // The future backend must make sign-out idempotent and expire the cookie server-side.
      }
    }

    dispatch({ type: 'RESET', intent: 'sign_in' });
  }, [gateway, invalidatePending]);

  const revokeSession = useCallback(async (sessionId: string) => {
    if (!gateway) return false;
    try {
      await gateway.revokeSession(sessionId);
      return true;
    } catch {
      return false;
    }
  }, [gateway]);

  return {
    state,
    methods,
    restore,
    setIntent,
    start,
    complete,
    signOut,
    revokeSession,
  } as const;
}
