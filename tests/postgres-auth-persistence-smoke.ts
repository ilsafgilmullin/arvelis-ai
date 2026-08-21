import pg from 'pg';
import type { EmailOtpChallengeRecord } from '../server/auth/emailOtp/contracts';
import type { SessionRecord } from '../server/auth/session/contracts';
import { PostgresAccountIdentityStore } from '../server/persistence/postgres/accountIdentityStore';
import { PostgresEmailOtpChallengeStore } from '../server/persistence/postgres/emailOtpChallengeStore';
import { PostgresEmailOtpRateLimitStore } from '../server/persistence/postgres/rateLimitStore';
import { PostgresSessionStore } from '../server/persistence/postgres/sessionStore';

const { Pool } = pg;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL persistence smoke');

  const pool = new Pool({ connectionString, max: 4, application_name: 'arvelis-auth-db-smoke' });
  try {
    await pool.query(`
      TRUNCATE TABLE
        auth_security_events,
        auth_sessions,
        auth_rate_limits,
        auth_email_otp_challenges,
        auth_email_identities,
        auth_accounts
      RESTART IDENTITY CASCADE
    `);

    const accounts = new PostgresAccountIdentityStore(pool);
    const challenges = new PostgresEmailOtpChallengeStore(pool);
    const limits = new PostgresEmailOtpRateLimitStore(pool);
    const sessions = new PostgresSessionStore(pool);

    const now = 1_787_323_200_000;
    const created = await accounts.createAccountWithEmailIdentity({
      accountId: 'account_db_smoke_01',
      identityId: 'identity_db_smoke_01',
      displayName: 'Ильсаф',
      canonicalEmail: 'smoke@example.com',
      verifiedAt: now,
      createdAt: now,
    });
    assert(created.status === 'created', 'account + email identity was not created atomically');
    assert(created.account.displayName === 'Ильсаф', 'display name was not persisted');

    const conflict = await accounts.createAccountWithEmailIdentity({
      accountId: 'account_db_smoke_02',
      identityId: 'identity_db_smoke_02',
      displayName: 'Другой',
      canonicalEmail: 'smoke@example.com',
      verifiedAt: now + 1,
      createdAt: now + 1,
    });
    assert(conflict.status === 'email_conflict', 'email uniqueness conflict was not returned');
    assert(conflict.identity.accountId === 'account_db_smoke_01', 'conflict pointed to the wrong account');

    const identity = await accounts.findEmailIdentityForAccount('account_db_smoke_01');
    assert(identity?.canonicalEmail === 'smoke@example.com', 'account email identity lookup failed');
    assert(await accounts.markIdentityAuthenticated('identity_db_smoke_01', now + 10), 'identity auth timestamp was not updated');

    const challengeA: EmailOtpChallengeRecord = {
      id: 'a'.repeat(32),
      intent: 'sign_in',
      email: 'smoke@example.com',
      codeMac: 'b'.repeat(64),
      createdAt: now,
      activatedAt: null,
      expiresAt: now + 600_000,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      supersededAt: null,
    };
    await challenges.createPending(challengeA);
    assert(await challenges.activateReplacingActive(challengeA.id, now + 10), 'first challenge was not activated');

    const challengeB: EmailOtpChallengeRecord = {
      ...challengeA,
      id: 'c'.repeat(32),
      codeMac: 'd'.repeat(64),
      createdAt: now + 20,
      expiresAt: now + 600_020,
    };
    await challenges.createPending(challengeB);
    assert(await challenges.activateReplacingActive(challengeB.id, now + 30), 'replacement challenge was not activated');
    const replacedAttempt = await challenges.beginAttempt(challengeA.id, now + 40);
    assert(replacedAttempt.status === 'superseded', 'previous active challenge was not superseded');
    const attempt = await challenges.beginAttempt(challengeB.id, now + 40);
    assert(attempt.status === 'ready' && attempt.attemptNumber === 1, 'challenge attempt was not incremented atomically');
    assert(await challenges.consume(challengeB.id, 1, now + 50), 'active challenge was not consumed');
    assert(!(await challenges.consume(challengeB.id, 1, now + 51)), 'consumed challenge replay succeeded');

    const rateKey = 'e'.repeat(64);
    const firstLimit = await limits.consume({
      scope: 'start_email',
      key: rateKey,
      limit: 2,
      windowMs: 60_000,
      now,
    });
    const secondLimit = await limits.consume({
      scope: 'start_email',
      key: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: now + 1,
    });
    const blockedLimit = await limits.consume({
      scope: 'start_email',
      key: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: now + 2,
    });
    assert(firstLimit.allowed && secondLimit.allowed, 'valid requests were blocked by rate limiter');
    assert(!blockedLimit.allowed && (blockedLimit.retryAfterSeconds ?? 0) > 0, 'rate limit was not enforced');
    const resetLimit = await limits.consume({
      scope: 'start_email',
      key: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: now + 60_001,
    });
    assert(resetLimit.allowed, 'rate limit window did not reset');

    const session: SessionRecord = {
      id: 'f'.repeat(32),
      accountId: 'account_db_smoke_01',
      secretMac: '1'.repeat(64),
      securityVersion: 1,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 86_400_000,
      revokedAt: null,
      revokeReason: null,
      deviceLabel: 'iPhone',
      browserLabel: 'Safari',
    };
    await sessions.create(session);
    assert((await sessions.findById(session.id))?.accountId === session.accountId, 'session was not persisted');
    assert(await sessions.touch(session.id, session.accountId, now + 1_000), 'session lastSeen touch failed');
    const listed = await sessions.listForAccount(session.accountId, now + 1_001, 10);
    assert(listed.length === 1 && listed[0]?.lastSeenAt === now + 1_000, 'session list/touch mismatch');
    assert(await sessions.revokeOwned(session.id, session.accountId, now + 2_000, 'user_sign_out'), 'owned session revoke failed');
    assert((await sessions.findById(session.id))?.revokeReason === 'user_sign_out', 'session revoke reason was not persisted');

    console.log('ARVELIS PostgreSQL auth persistence smoke: PASS');
  } finally {
    await pool.end();
  }
}

void main();
