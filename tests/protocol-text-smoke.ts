import type { AuthTransport } from '../src/auth/guardedGateway';
import { AuthProtocolError, createGuardedAuthGateway } from '../src/auth/guardedGateway';
import { containsUnsafeProtocolCharacters } from '../src/auth/protocolText';
import {
  isAuthChallenge,
  isAuthMethodDescriptor,
  isAuthSession,
  isAuthSessionSummary,
} from '../src/auth/runtimeGuards';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

assert(!containsUnsafeProtocolCharacters('ARVELIS AI'), 'ordinary protocol text marked unsafe');
assert(containsUnsafeProtocolCharacters('Google\u200BID'), 'zero-width format control accepted');
assert(containsUnsafeProtocolCharacters('User\u202Eadmin'), 'bidi override accepted');
assert(containsUnsafeProtocolCharacters('bad\u0000value'), 'ASCII NUL accepted');
assert(!containsUnsafeProtocolCharacters('Ильсаф ✅'), 'ordinary Unicode text marked unsafe');

assert(
  !isAuthMethodDescriptor({
    id: 'oidc',
    kind: 'external',
    label: 'Provider\u202Eevil',
    enabled: true,
  }),
  'bidi control in server method label reached application state',
);

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

assert(isAuthSession(validSession), 'valid session rejected');
assert(
  !isAuthSession({
    ...validSession,
    account: { ...validSession.account, displayName: 'User\u200BAdmin' },
  }),
  'zero-width control in server account display name reached application state',
);
assert(
  !isAuthSession({ ...validSession, createdAt: '2026-08-21T08:00:00.000Z\n' }),
  'raw newline in session createdAt was accepted by Date parser',
);
assert(
  !isAuthSession({ ...validSession, expiresAt: '\t2026-08-22T08:00:00.000Z' }),
  'raw tab in session expiresAt was accepted by Date parser',
);
assert(
  !isAuthSessionSummary({
    id: 'session-summary-1',
    current: true,
    createdAt: '2026-08-21T08:00:00.000Z',
    lastSeenAt: '2026-08-21T09:00:00.000Z\n',
    expiresAt: '2026-08-22T08:00:00.000Z',
  }),
  'raw control in session lastSeenAt was accepted',
);
assert(
  !isAuthChallenge({
    id: 'challenge-1',
    methodId: 'email',
    kind: 'code',
    expiresAt: '2026-08-21T08:10:00.000Z\n',
  }),
  'raw control in challenge expiresAt was accepted',
);

class CaptureTransport implements AuthTransport {
  startCalls = 0;
  completeCalls = 0;
  revokeCalls = 0;

  getMethods = async () => [];
  restoreSession = async () => null;
  start = async () => {
    this.startCalls += 1;
    return { ok: false, error: { code: 'invalid_input', message: '' } };
  };
  complete = async () => {
    this.completeCalls += 1;
    return { ok: false, error: { code: 'invalid_challenge', message: '' } };
  };
  signOut = async () => {};
  listSessions = async () => [];
  revokeSession = async () => {
    this.revokeCalls += 1;
  };
}

void (async () => {
  const transport = new CaptureTransport();
  const gateway = createGuardedAuthGateway(transport);

  const rejectedStartRequests = [
    { intent: 'sign_in' as const, methodId: 'email\u200Badmin', identifier: 'person@example.com' },
    { intent: 'sign_in' as const, methodId: 'email\n', identifier: 'person@example.com' },
    { intent: 'sign_in' as const, methodId: '\temail', identifier: 'person@example.com' },
    { intent: 'sign_in' as const, methodId: 'email', identifier: 'person@example.com\t' },
  ];

  for (const request of rejectedStartRequests) {
    let rejected = false;
    try {
      await gateway.start(request);
    } catch (error) {
      rejected = error instanceof AuthProtocolError;
    }
    assert(rejected, 'unsafe raw start request was accepted');
  }
  assert(transport.startCalls === 0, 'unsafe raw start request reached transport');

  const rejectedCompleteRequests = [
    { challengeId: 'challenge-1', response: '12\u202E34' },
    { challengeId: 'challenge-1\n', response: '1234' },
    { challengeId: '\tchallenge-1', response: '1234' },
    { challengeId: 'challenge-1', response: '1234\n' },
    { challengeId: 'challenge-1', response: '\t1234' },
  ];

  for (const request of rejectedCompleteRequests) {
    let rejected = false;
    try {
      await gateway.complete(request);
    } catch (error) {
      rejected = error instanceof AuthProtocolError;
    }
    assert(rejected, 'unsafe raw complete request was accepted');
  }
  assert(transport.completeCalls === 0, 'unsafe raw complete request reached transport');

  const rejectedSessionIds = ['session\u200B1', 'session-1\n', '\tsession-1'];
  for (const sessionId of rejectedSessionIds) {
    let rejected = false;
    try {
      await gateway.revokeSession(sessionId);
    } catch (error) {
      rejected = error instanceof AuthProtocolError;
    }
    assert(rejected, 'unsafe raw session id was accepted');
  }
  assert(transport.revokeCalls === 0, 'unsafe raw session id reached revoke transport');

  console.log('ARVELIS protocol text smoke: PASS');
})();
