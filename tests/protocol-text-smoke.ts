import type { AuthTransport } from '../src/auth/guardedGateway';
import { AuthProtocolError, createGuardedAuthGateway } from '../src/auth/guardedGateway';
import { containsUnsafeProtocolCharacters } from '../src/auth/protocolText';
import { isAuthMethodDescriptor, isAuthSession } from '../src/auth/runtimeGuards';

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

assert(
  !isAuthSession({
    id: 'session-1',
    account: {
      id: 'account-1',
      displayName: 'User\u200BAdmin',
      emailVerified: false,
      phoneVerified: false,
    },
    createdAt: '2026-08-21T08:00:00.000Z',
    expiresAt: '2026-08-22T08:00:00.000Z',
  }),
  'zero-width control in server account display name reached application state',
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

  let startRejected = false;
  try {
    await gateway.start({ intent: 'sign_in', methodId: 'email\u200Badmin', identifier: 'person@example.com' });
  } catch (error) {
    startRejected = error instanceof AuthProtocolError;
  }
  assert(startRejected && transport.startCalls === 0, 'unsafe method id reached start transport');

  let completeRejected = false;
  try {
    await gateway.complete({ challengeId: 'challenge-1', response: '12\u202E34' });
  } catch (error) {
    completeRejected = error instanceof AuthProtocolError;
  }
  assert(completeRejected && transport.completeCalls === 0, 'unsafe code response reached complete transport');

  let revokeRejected = false;
  try {
    await gateway.revokeSession('session\u200B1');
  } catch (error) {
    revokeRejected = error instanceof AuthProtocolError;
  }
  assert(revokeRejected && transport.revokeCalls === 0, 'unsafe session id reached revoke transport');

  console.log('ARVELIS protocol text smoke: PASS');
})();
