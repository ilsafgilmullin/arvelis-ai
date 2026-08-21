import type { AuthTransport } from '../src/auth/guardedGateway';
import { AuthProtocolError, createGuardedAuthGateway } from '../src/auth/guardedGateway';
import {
  isAuthChallenge,
  isAuthFailure,
  isAuthMethodDescriptor,
  isAuthSession,
  isAuthSessionSummary,
} from '../src/auth/runtimeGuards';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const validCodeChallenge = {
  id: 'challenge-1',
  methodId: 'email',
  kind: 'code' as const,
};
const validSession = {
  id: 'session-1',
  account: {
    id: 'account-1',
    displayName: 'Ильсаф',
    emailVerified: false,
    phoneVerified: false,
  },
  createdAt: '2026-08-21T08:00:00.000Z',
  expiresAt: '2026-08-22T08:00:00.000Z',
};

assert(
  !isAuthMethodDescriptor({
    id: 'email',
    kind: 'identifier',
    label: 'Email',
    enabled: true,
    identifierType: 'email',
    accessToken: 'must-not-pass',
  }),
  'unexpected method field reached application contract',
);
assert(
  !isAuthSession({
    ...validSession,
    internalRole: 'owner',
  }),
  'unexpected session field reached application contract',
);
assert(
  !isAuthSession({
    ...validSession,
    account: { ...validSession.account, providerToken: 'must-not-pass' },
  }),
  'unexpected account field reached application contract',
);
assert(
  !isAuthSessionSummary({
    id: 'session-1',
    current: true,
    createdAt: '2026-08-21T08:00:00.000Z',
    expiresAt: '2026-08-22T08:00:00.000Z',
    fingerprint: 'must-not-pass',
  }),
  'unexpected session-summary field reached application contract',
);
assert(
  !isAuthChallenge({ ...validCodeChallenge, accessToken: 'must-not-pass' }),
  'unexpected challenge field reached application contract',
);
assert(
  !isAuthFailure({ code: 'service_unavailable', message: '', providerDebug: 'must-not-pass' }),
  'unexpected failure field reached application contract',
);

class ExtraEnvelopeTransport implements AuthTransport {
  startPayload: unknown = {
    ok: true,
    challenge: validCodeChallenge,
    accessToken: 'must-not-pass',
  };
  completePayload: unknown = {
    ok: true,
    session: validSession,
    sessionToken: 'must-not-pass',
  };

  getMethods = async () => [];
  restoreSession = async () => null;
  start = async () => this.startPayload;
  complete = async () => this.completePayload;
  signOut = async () => {};
  listSessions = async () => [];
  revokeSession = async (_sessionId: string) => {};
}

void (async () => {
  const transport = new ExtraEnvelopeTransport();
  const gateway = createGuardedAuthGateway(transport);

  let startRejected = false;
  try {
    await gateway.start({ intent: 'sign_in', methodId: 'email', identifier: 'person@example.com' });
  } catch (error) {
    startRejected = error instanceof AuthProtocolError;
  }
  assert(startRejected, 'unexpected start-result envelope field was accepted');

  let completeRejected = false;
  try {
    await gateway.complete({ challengeId: 'challenge-1', response: '1234' });
  } catch (error) {
    completeRejected = error instanceof AuthProtocolError;
  }
  assert(completeRejected, 'unexpected complete-result envelope field was accepted');

  transport.startPayload = {
    ok: false,
    error: { code: 'service_unavailable', message: '' },
    providerDebug: 'must-not-pass',
  };
  let failureEnvelopeRejected = false;
  try {
    await gateway.start({ intent: 'sign_in', methodId: 'email', identifier: 'person@example.com' });
  } catch (error) {
    failureEnvelopeRejected = error instanceof AuthProtocolError;
  }
  assert(failureEnvelopeRejected, 'unexpected failure-result envelope field was accepted');

  console.log('ARVELIS protocol exact-shape smoke: PASS');
})();
