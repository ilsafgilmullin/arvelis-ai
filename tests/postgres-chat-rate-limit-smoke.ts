import pg from 'pg';
import { PostgresAccountIdentityStore } from '../server/persistence/postgres/accountIdentityStore';
import { PostgresChatRateLimitStore } from '../server/persistence/postgres/chatRateLimitStore';

const { Pool } = pg;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL Chat rate-limit smoke');

  const pool = new Pool({ connectionString, max: 4, application_name: 'arvelis-chat-rate-limit-smoke' });
  try {
    await pool.query(`
      TRUNCATE TABLE
        chat_rate_limits,
        chat_attachments,
        chat_messages,
        chat_conversations,
        auth_security_events,
        auth_sessions,
        auth_rate_limits,
        auth_email_otp_challenges,
        auth_email_identities,
        auth_accounts
      RESTART IDENTITY CASCADE
    `);

    const accounts = new PostgresAccountIdentityStore(pool);
    for (const [accountId, identityId, email] of [
      ['pg-limit-account-a', 'pg-limit-identity-a', 'pg-limit-a@example.test'],
      ['pg-limit-account-b', 'pg-limit-identity-b', 'pg-limit-b@example.test'],
    ] as const) {
      const created = await accounts.createAccountWithEmailIdentity({
        accountId,
        identityId,
        displayName: accountId,
        canonicalEmail: email,
        verifiedAt: 1_000,
        createdAt: 1_000,
      });
      assert(created.status === 'created', 'PostgreSQL rate-limit smoke account must be created');
    }

    const store = new PostgresChatRateLimitStore(pool);
    const base = {
      scope: 'create' as const,
      accountId: 'pg-limit-account-a',
      limit: 2,
      windowMs: 1_000,
    };

    assert((await store.consume({ ...base, now: 10_000 })).allowed, 'First PostgreSQL request must be allowed');
    assert((await store.consume({ ...base, now: 10_100 })).allowed, 'Second PostgreSQL request must be allowed');
    const denied = await store.consume({ ...base, now: 10_200 });
    assert(!denied.allowed, 'Third PostgreSQL request must be denied');
    assert((denied.retryAfterSeconds ?? 0) === 1, 'Denied PostgreSQL request must expose retry delay');

    const otherScope = await store.consume({ ...base, scope: 'mutation', now: 10_200 });
    assert(otherScope.allowed, 'PostgreSQL scopes must have independent counters');

    const otherAccount = await store.consume({ ...base, accountId: 'pg-limit-account-b', now: 10_200 });
    assert(otherAccount.allowed, 'PostgreSQL accounts must have independent counters');

    const reset = await store.consume({ ...base, now: 11_000 });
    assert(reset.allowed, 'Expired PostgreSQL window must reset');
    const row = await pool.query<{ consumed_count: number; window_started_at: string; expires_at: string }>(`
      SELECT consumed_count, window_started_at, expires_at
      FROM chat_rate_limits
      WHERE scope = 'create' AND account_id = 'pg-limit-account-a'
    `);
    assert(row.rows[0]?.consumed_count === 1, 'PostgreSQL reset must restart consumed count at one');
    assert(Number(row.rows[0]?.window_started_at) === 11_000, 'PostgreSQL reset must replace window start');
    assert(Number(row.rows[0]?.expires_at) === 12_000, 'PostgreSQL reset must replace expiry');

    console.log('ARVELIS PostgreSQL chat rate-limit smoke: PASS');
  } finally {
    await pool.end();
  }
}

void main();
