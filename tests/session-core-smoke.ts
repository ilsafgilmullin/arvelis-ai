import type {
  AccountAuthenticationReader,
  AccountAuthenticationSnapshot,
} from '../server/auth/account/contracts';
import type {
  SessionRecord,
  SessionRevokeReason,
  SessionStore,
} from '../server/auth/session/contracts';
import { SESSION_POLICY_CANDIDATE } from '../server/auth/session/policy';
import { SessionService } from '../server/auth/session/service';
import { WebCryptoSessionSecurity } from '../server/auth/session/webCryptoSecurity';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function cloneRecord(record: SessionRecord): SessionRecord {
  return { ...record };
}

class MemoryAccountReader implements AccountAuthenticationReader {
  readonly accounts = new Map<string, AccountAuthenticationSnapshot>();

  async getAuthenticationSnapshot(accountId: string): Promise<AccountAuthenticationSnapshot | null> {
    const account = this.accounts.get(accountId);
    return account ? { ...account } : null;
  }
}

class MemorySessionStore implements SessionStore {
  readonly records = new Map<string, SessionRecord>();
  failList = false;
  failRevoke = false;

  async create(record: SessionRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error('duplicate session id');
    this.records.set(record.id, cloneRecord(record));
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const record = this.records.get(sessionId);
    return record ? cloneRecord(record) : null;
  }

  async touch(sessionId: string, accountId: string, seenAt: number): Promise<boolean> {
    const record = this.records.get(sessionId);
    if (!record || record.accountId !== accountId || record.revokedAt !== null || seenAt >= record.expiresAt) return false;
    this.records.set(sessionId, { ...record, lastSeenAt: seenAt });
    return true;
  }

  async revokeOwned(
    sessionId: string,
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    if (this.failRevoke) throw new Error('simulated revoke failure');
    const record = this.records.get(sessionId);
    if (!record || record.accountId !== accountId || record.revokedAt !== null) return false;
    this.records.set(sessionId, { ...record, revokedAt, revokeReason: reason });
    return true;
  }

  async revokeAllForAccount(
    accountId: string,
    revokedAt: number,
    reason: SessionRevokeReason,
  ): Promise<number> {
    if (this.failRevoke) throw new Error('simulated revoke-all failure');
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.accountId === accountId && record.revokedAt === null) {
        this.records.set(id, { ...record, revokedAt, revokeReason: reason });
        count += 1;
      }
    }
    return count;
  }

  async listForAccount(accountId: string, _now: number, limit: number): Promise<SessionRecord[]> {
    if (this.failList) throw new Error('simulated database failure');
    return [...this.records.values()]
      .filter((record) => record.accountId === accountId)
      .slice(0, limit)
      .map(cloneRecord);
  }
}

async function main(): Promise<void> {
  let now = 1_760_000_000_000;
  const pepper = new Uint8Array(32);
  for (let index = 0; index < pepper.length; index += 1) pepper[index] = 255 - index;

  const accounts = new MemoryAccountReader();
  const store = new MemorySessionStore();
  const security = new WebCryptoSessionSecurity(pepper);
  const service = new SessionService({ store, accounts, security, now: () => now });

  const account: AccountAuthenticationSnapshot = {
    id: 'account_1234567890',
    status: 'active',
    securityVersion: 3,
  };
  accounts.accounts.set(account.id, { ...account });

  const issued = await service.issue({
    account,
    deviceLabel: 'iPhone',
    browserLabel: 'Safari',
  });
  assert(issued.ok, 'active account session was not issued');
  assert(/^[a-f0-9]{32}$/.test(issued.session.sessionId), 'session id is not 128-bit hex');
  assert(/^[a-f0-9]{64}$/.test(issued.session.secret), 'session secret is not 256-bit hex');

  const stored = store.records.get(issued.session.sessionId);
  assert(stored, 'session record was not stored');
  assert(stored.secretMac !== issued.session.secret, 'raw session secret was persisted');
  assert(stored.secretMac.length === 64, 'session MAC length is unexpected');
  assert(stored.securityVersion === account.securityVersion, 'security version was not bound to session');

  const wrongSecret = issued.session.secret === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
  const wrong = await service.authenticate({ sessionId: issued.session.sessionId, secret: wrongSecret });
  assert(!wrong.ok && wrong.error === 'invalid_session', 'wrong session secret authenticated');

  const authenticated = await service.authenticate({
    sessionId: issued.session.sessionId,
    secret: issued.session.secret,
  });
  assert(authenticated.ok, 'valid session did not authenticate');
  assert(authenticated.session.account.id === account.id, 'authenticated account changed');

  now += SESSION_POLICY_CANDIDATE.touchIntervalMs;
  const touched = await service.authenticate({
    sessionId: issued.session.sessionId,
    secret: issued.session.secret,
  });
  assert(touched.ok, 'valid session failed after touch interval');
  assert(touched.session.lastSeenAt === now, 'lastSeen was not refreshed');

  const listed = await service.listForAccount(account.id, issued.session.sessionId);
  assert(listed.ok, 'session list failed');
  assert(listed.sessions.length === 1, 'active session missing from list');
  assert(listed.sessions[0]?.current === true, 'current session was not marked current');

  store.failList = true;
  const listFailure = await service.listForAccount(account.id, issued.session.sessionId);
  assert(!listFailure.ok && listFailure.error === 'service_unavailable', 'database list failure was masked as empty list');
  store.failList = false;

  const otherAccount: AccountAuthenticationSnapshot = {
    id: 'account_0987654321',
    status: 'active',
    securityVersion: 1,
  };
  accounts.accounts.set(otherAccount.id, { ...otherAccount });
  const foreignRevoke = await service.revokeOwned(otherAccount.id, issued.session.sessionId);
  assert(foreignRevoke.ok && !foreignRevoke.revoked, 'session could be revoked through another account id');

  store.failRevoke = true;
  const revokeFailure = await service.revokeOwned(account.id, issued.session.sessionId);
  assert(!revokeFailure.ok && revokeFailure.error === 'service_unavailable', 'revoke database failure was masked');
  const revokeAllFailure = await service.revokeAllForAccount(account.id);
  assert(!revokeAllFailure.ok && revokeAllFailure.error === 'service_unavailable', 'revoke-all database failure was masked');
  store.failRevoke = false;

  const revoked = await service.revokeOwned(account.id, issued.session.sessionId, 'user_sign_out');
  assert(revoked.ok && revoked.revoked, 'owned session was not revoked');
  const afterRevoke = await service.authenticate({
    sessionId: issued.session.sessionId,
    secret: issued.session.secret,
  });
  assert(!afterRevoke.ok && afterRevoke.error === 'invalid_session', 'revoked session authenticated');

  const suspendedIssue = await service.issue({
    account: { ...account, status: 'suspended' },
  });
  assert(!suspendedIssue.ok && suspendedIssue.error === 'account_unavailable', 'suspended account received a session');

  const versionSession = await service.issue({ account });
  assert(versionSession.ok, 'security-version test session issue failed');
  accounts.accounts.set(account.id, { ...account, securityVersion: account.securityVersion + 1 });
  const versionMismatch = await service.authenticate({
    sessionId: versionSession.session.sessionId,
    secret: versionSession.session.secret,
  });
  assert(!versionMismatch.ok && versionMismatch.error === 'invalid_session', 'old securityVersion session remained valid');
  const versionRecord = store.records.get(versionSession.session.sessionId);
  assert(versionRecord?.revokeReason === 'security_change', 'security-version mismatch was not revoked');

  accounts.accounts.set(account.id, { ...account });
  const suspendedSession = await service.issue({ account });
  assert(suspendedSession.ok, 'account-disable test session issue failed');
  accounts.accounts.set(account.id, { ...account, status: 'suspended' });
  const disabled = await service.authenticate({
    sessionId: suspendedSession.session.sessionId,
    secret: suspendedSession.session.secret,
  });
  assert(!disabled.ok && disabled.error === 'account_unavailable', 'suspended account session authenticated');
  const disabledRecord = store.records.get(suspendedSession.session.sessionId);
  assert(disabledRecord?.revokeReason === 'account_disabled', 'disabled-account session was not revoked');

  accounts.accounts.set(account.id, { ...account });
  const expiring = await service.issue({ account });
  assert(expiring.ok, 'expiry test session issue failed');
  now = expiring.session.expiresAt;
  const expired = await service.authenticate({
    sessionId: expiring.session.sessionId,
    secret: expiring.session.secret,
  });
  assert(!expired.ok && expired.error === 'session_expired', 'expired session authenticated');
  const expiredRecord = store.records.get(expiring.session.sessionId);
  assert(expiredRecord?.revokeReason === 'expired_cleanup', 'expired session was not marked for cleanup');

  now += 1;
  const invalidLabel = await service.issue({ account, deviceLabel: 'bad\nlabel' });
  assert(!invalidLabel.ok, 'unsafe device label was accepted');

  let invalidPolicyRejected = false;
  try {
    new SessionService({
      store,
      accounts,
      security,
      now: () => now,
      policy: { ...SESSION_POLICY_CANDIDATE, ttlMs: 0 },
    });
  } catch {
    invalidPolicyRejected = true;
  }
  assert(invalidPolicyRejected, 'invalid session policy was accepted');

  const macSessionId = 'a'.repeat(32);
  const macSecret = 'b'.repeat(64);
  const mac = await security.macSessionSecret({ sessionId: macSessionId, secret: macSecret });
  assert(
    await security.verifySessionSecret({ sessionId: macSessionId, secret: macSecret, expectedMac: mac }),
    'WebCrypto rejected valid session MAC',
  );
  assert(
    !(await security.verifySessionSecret({ sessionId: macSessionId, secret: 'c'.repeat(64), expectedMac: mac })),
    'WebCrypto accepted wrong session secret',
  );

  console.log('ARVELIS server session core smoke: PASS');
}

void main();
