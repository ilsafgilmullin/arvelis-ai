import {
  SqliteAccountIdentityStore,
  SqliteEmailOtpChallengeStore,
  SqliteEmailOtpRateLimitStore,
  SqliteSessionStore,
} from '../server/persistence/sqlite/authStores';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  let rejectedUnsafePath = false;
  try {
    openSqliteAuthDatabase('arvelis-auth.db');
  } catch {
    rejectedUnsafePath = true;
  }
  assert(rejectedUnsafePath, 'SQLite runtime accepted a file path outside .data/');

  const database = openSqliteAuthDatabase(':memory:');
  try {
    const accounts = new SqliteAccountIdentityStore(database);
    const challenges = new SqliteEmailOtpChallengeStore(database);
    const limits = new SqliteEmailOtpRateLimitStore(database);
    const sessions = new SqliteSessionStore(database);

    const created = await accounts.createAccountWithEmailIdentity({
      accountId: 'acct-1',
      identityId: 'identity-1',
      displayName: 'Ильсаф',
      canonicalEmail: 'owner@example.test',
      verifiedAt: 1_000,
      createdAt: 1_000,
    });
    assert(created.status === 'created', 'SQLite must create account and identity atomically');
    assert(created.account.displayName === 'Ильсаф', 'SQLite must preserve display name');

    const duplicate = await accounts.createAccountWithEmailIdentity({
      accountId: 'acct-2',
      identityId: 'identity-2',
      displayName: 'Другой',
      canonicalEmail: 'owner@example.test',
      verifiedAt: 2_000,
      createdAt: 2_000,
    });
    assert(duplicate.status === 'email_conflict', 'SQLite must enforce canonical email uniqueness');
    assert(await accounts.getAccount('acct-2') === null, 'Email conflict must not leave a partial account');

    await challenges.createPending({
      id: 'challenge-1',
      intent: 'sign_up',
      email: 'owner@example.test',
      codeMac: 'mac-1',
      createdAt: 10_000,
      activatedAt: null,
      expiresAt: 20_000,
      attempts: 0,
      maxAttempts: 3,
      consumedAt: null,
      supersededAt: null,
    });
    assert(await challenges.activateReplacingActive('challenge-1', 10_100), 'First challenge must activate');

    await challenges.createPending({
      id: 'challenge-2',
      intent: 'sign_up',
      email: 'owner@example.test',
      codeMac: 'mac-2',
      createdAt: 11_000,
      activatedAt: null,
      expiresAt: 21_000,
      attempts: 0,
      maxAttempts: 3,
      consumedAt: null,
      supersededAt: null,
    });
    assert(await challenges.activateReplacingActive('challenge-2', 11_100), 'Replacement challenge must activate');
    const superseded = await challenges.beginAttempt('challenge-1', 11_200);
    assert(superseded.status === 'superseded', 'Previous active OTP must be superseded');

    const attempt = await challenges.beginAttempt('challenge-2', 11_200);
    assert(attempt.status === 'ready' && attempt.attemptNumber === 1, 'OTP attempt must increment atomically');
    assert(await challenges.consume('challenge-2', 1, 11_300), 'OTP must consume once');
    assert(!(await challenges.consume('challenge-2', 1, 11_301)), 'Consumed OTP must reject replay');

    const firstLimit = await limits.consume({
      scope: 'start_email',
      key: 'privacy-key',
      limit: 2,
      windowMs: 60_000,
      now: 30_000,
    });
    const secondLimit = await limits.consume({
      scope: 'start_email',
      key: 'privacy-key',
      limit: 2,
      windowMs: 60_000,
      now: 30_100,
    });
    const blockedLimit = await limits.consume({
      scope: 'start_email',
      key: 'privacy-key',
      limit: 2,
      windowMs: 60_000,
      now: 30_200,
    });
    assert(firstLimit.allowed && secondLimit.allowed, 'Rate limiter must allow requests inside limit');
    assert(!blockedLimit.allowed && (blockedLimit.retryAfterSeconds ?? 0) > 0, 'Rate limiter must block excess request');

    await sessions.create({
      id: '0123456789abcdef0123456789abcdef',
      accountId: 'acct-1',
      secretMac: 'session-mac',
      securityVersion: 1,
      createdAt: 40_000,
      lastSeenAt: 40_000,
      expiresAt: 100_000,
      revokedAt: null,
      revokeReason: null,
      deviceLabel: 'iPhone',
      browserLabel: 'Safari',
    });
    const storedSession = await sessions.findById('0123456789abcdef0123456789abcdef');
    assert(storedSession?.accountId === 'acct-1', 'SQLite must persist server session');
    assert(await sessions.touch('0123456789abcdef0123456789abcdef', 'acct-1', 41_000), 'Owned session must touch');
    const listed = await sessions.listForAccount('acct-1', 41_000, 10);
    assert(listed.length === 1 && listed[0]?.lastSeenAt === 41_000, 'Active session list must return touched session');
    assert(await sessions.revokeOwned('0123456789abcdef0123456789abcdef', 'acct-1', 42_000, 'user_sign_out'), 'Owned session must revoke');
    assert((await sessions.listForAccount('acct-1', 42_001, 10)).length === 0, 'Revoked session must not remain active');

    const migration = database.prepare(
      'SELECT checksum FROM auth_schema_migrations WHERE id = ?',
    ).get('001_auth_foundation') as { checksum?: unknown } | undefined;
    assert(typeof migration?.checksum === 'string' && migration.checksum.length === 64, 'SQLite schema migration must be checksummed');

    console.log('ARVELIS SQLite auth persistence smoke: PASS');
  } finally {
    database.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SQLite smoke failed');
  process.exitCode = 1;
});
