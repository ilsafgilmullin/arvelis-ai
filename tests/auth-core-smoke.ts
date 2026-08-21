import { authUiReducer } from '../src/auth/reducer';
import { createGuardedAuthGateway, AuthProtocolError, type AuthTransport } from '../src/auth/guardedGateway';
import { getExternalAuthorizationUrl } from '../src/auth/externalFlow';
import {
  isAuthChallenge,
  isAuthFailure,
  isAuthSession,
  isAuthSessionSummary,
  isSecureAuthorizationUrl,
} from '../src/auth/runtimeGuards';
import type { AuthCodeChallenge, AuthSession } from '../src/auth/contracts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const validSession: AuthSession = {
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

// External navigation and redirect guard.
assert(isSecureAuthorizationUrl('https://id.example.com/oauth?client=1'), 'valid https URL rejected');
assert(!isSecureAuthorizationUrl('http://id.example.com/oauth'), 'http URL accepted');
assert(!isSecureAuthorizationUrl('javascript:alert(1)'), 'javascript URL accepted');
assert(!isSecureAuthorizationUrl('https://user:pass@id.example.com/oauth'), 'URL credentials accepted');
assert(!isSecureAuthorizationUrl('https://id.example.com/oauth#token'), 'fragment accepted');
assert(
  getExternalAuthorizationUrl({
    id: 'external-1',
    methodId: 'oidc',
    kind: 'external_redirect',
    redirectUrl: 'https://id.example.com/oauth',
  }) === 'https://id.example.com/oauth',
  'valid external authorization URL rejected',
);
assert(
  getExternalAuthorizationUrl({ id: 'code-1', methodId: 'email', kind: 'code' }) === null,
  'code challenge returned an external URL',
);

// Challenge discriminant and bounded strings.
assert(
  isAuthChallenge({ id: 'c1', methodId: 'm1', kind: 'code', maskedDestination: 'i***@mail.test' }),
  'valid code challenge rejected',
);
assert(
  !isAuthChallenge({ id: 'c1', methodId: 'm1', kind: 'code', redirectUrl: 'https://id.example.com' }),
  'code challenge accepted redirectUrl',
);
assert(
  isAuthChallenge({ id: 'c2', methodId: 'm2', kind: 'external_redirect', redirectUrl: 'https://id.example.com/oauth' }),
  'valid external challenge rejected',
);
assert(
  !isAuthChallenge({
    id: 'c2',
    methodId: 'm2',
    kind: 'external_redirect',
    redirectUrl: 'https://id.example.com/oauth',
    maskedDestination: 'x',
  }),
  'external challenge accepted maskedDestination',
);
assert(!isAuthChallenge({ id: 'c\n2', methodId: 'm2', kind: 'code' }), 'control character in challenge id accepted');

// Account/session consistency.
assert(isAuthSession(validSession), 'valid session rejected');
assert(!isAuthSession({ ...validSession, expiresAt: validSession.createdAt }), 'zero-length session accepted');
assert(!isAuthSession({ ...validSession, expiresAt: '2026-08-20T08:00:00.000Z' }), 'backwards session accepted');
assert(
  !isAuthSession({ ...validSession, account: { ...validSession.account, emailVerified: true } }),
  'verified email without email accepted',
);
assert(
  !isAuthSession({ ...validSession, account: { ...validSession.account, displayName: 'bad\nname' } }),
  'control character in account display name accepted',
);
assert(
  !isAuthSessionSummary({
    id: 's',
    current: true,
    createdAt: '2026-08-22T08:00:00Z',
    expiresAt: '2026-08-21T08:00:00Z',
  }),
  'backwards session summary accepted',
);

// Failure metadata ceiling.
assert(isAuthFailure({ code: 'rate_limited', message: 'wait', retryAfterSeconds: 30 }), 'valid retry-after rejected');
assert(
  !isAuthFailure({ code: 'rate_limited', message: 'wait', retryAfterSeconds: 999_999 }),
  'oversized retry-after accepted',
);

// Reducer preserves a recoverable challenge and the live session on logout failure.
const codeChallenge: AuthCodeChallenge = { id: 'challenge-1', methodId: 'email', kind: 'code' };
const challengeState = authUiReducer(
  { status: 'verifying', intent: 'sign_in', challenge: codeChallenge },
  {
    type: 'CHALLENGE_FAILURE',
    intent: 'sign_in',
    challenge: codeChallenge,
    error: { code: 'invalid_challenge', message: 'bad code' },
  },
);
assert(
  challengeState.status === 'challenge'
    && challengeState.challenge.id === codeChallenge.id
    && challengeState.error?.code === 'invalid_challenge',
  'recoverable challenge was not preserved',
);

const signOutStarted = authUiReducer(
  { status: 'authenticated', session: validSession },
  { type: 'SIGN_OUT_START', session: validSession },
);
assert(
  signOutStarted.status === 'signing_out' && signOutStarted.session.id === validSession.id,
  'logout start lost the live session',
);
const signOutFailed = authUiReducer(signOutStarted, {
  type: 'SIGN_OUT_FAILED',
  session: validSession,
  error: { code: 'service_unavailable', message: 'down' },
});
assert(
  signOutFailed.status === 'sign_out_error' && signOutFailed.session.id === validSession.id,
  'logout failure lost the active session',
);

class FakeTransport implements AuthTransport {
  methods: unknown = [{ id: 'email', kind: 'identifier', label: 'Email', enabled: true, identifierType: 'email' }];
  session: unknown = validSession;
  sessions: unknown = [{
    id: 's1',
    current: true,
    createdAt: '2026-08-21T08:00:00.000Z',
    expiresAt: '2026-08-22T08:00:00.000Z',
  }];

  getMethods = async () => this.methods;
  restoreSession = async () => this.session;
  start = async () => ({ ok: true, challenge: codeChallenge });
  complete = async () => ({ ok: true, session: validSession });
  signOut = async () => {};
  listSessions = async () => this.sessions;
  revokeSession = async (_sessionId: string) => {};
}

void (async () => {
  const transport = new FakeTransport();
  const gateway = createGuardedAuthGateway(transport);

  assert((await gateway.getMethods()).length === 1, 'valid method catalog rejected');
  assert((await gateway.restoreSession())?.id === validSession.id, 'valid restore rejected');

  let emptyCodeRejected = false;
  try {
    await gateway.complete({ challengeId: 'challenge-1', response: '   ' });
  } catch (error) {
    emptyCodeRejected = error instanceof AuthProtocolError;
  }
  assert(emptyCodeRejected, 'empty completion response reached transport');

  let emptyMethodRejected = false;
  try {
    await gateway.start({ intent: 'sign_in', methodId: '   ' });
  } catch (error) {
    emptyMethodRejected = error instanceof AuthProtocolError;
  }
  assert(emptyMethodRejected, 'empty method id reached transport');

  transport.methods = [
    { id: 'same', kind: 'identifier', label: 'A', enabled: true, identifierType: 'email' },
    { id: 'same', kind: 'identifier', label: 'B', enabled: true, identifierType: 'email' },
  ];
  let duplicateRejected = false;
  try {
    await gateway.getMethods();
  } catch (error) {
    duplicateRejected = error instanceof AuthProtocolError;
  }
  assert(duplicateRejected, 'duplicate method ids accepted');

  transport.sessions = [
    { id: 's1', current: true, createdAt: '2026-08-21T08:00:00.000Z', expiresAt: '2026-08-22T08:00:00.000Z' },
    { id: 's2', current: true, createdAt: '2026-08-21T08:00:00.000Z', expiresAt: '2026-08-22T08:00:00.000Z' },
  ];
  let multipleCurrentRejected = false;
  try {
    await gateway.listSessions();
  } catch (error) {
    multipleCurrentRejected = error instanceof AuthProtocolError;
  }
  assert(multipleCurrentRejected, 'multiple current sessions accepted');

  console.log('ARVELIS auth core smoke: PASS');
})();
