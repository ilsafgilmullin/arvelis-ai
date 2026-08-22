import { SqliteAccountIdentityStore } from '../server/persistence/sqlite/authStores';
import { SqliteChatRateLimitStore } from '../server/persistence/sqlite/chatRateLimitStore';
import { openSqliteAuthDatabase } from '../server/persistence/sqlite/database';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');
  try {
    const accounts = new SqliteAccountIdentityStore(database);
    for (const [accountId, identityId, email] of [
      ['limit-account-a', 'limit-identity-a', 'limit-a@example.test'],
      ['limit-account-b', 'limit-identity-b', 'limit-b@example.test'],
    ] as const) {
      const created = await accounts.createAccountWithEmailIdentity({
        accountId,
        identityId,
        displayName: accountId,
        canonicalEmail: email,
        verifiedAt: 1_000,
        createdAt: 1_000,
      });
      assert(created.status === 'created', 'SQLite rate-limit smoke account must be created');
    }

    const store = new SqliteChatRateLimitStore(database);
    const base = {
      scope: 'create' as const,
      accountId: 'limit-account-a',
      limit: 2,
      windowMs: 1_000,
    };

    assert((await store.consume({ ...base, now: 10_000 })).allowed, 'First request must be allowed');
    assert((await store.consume({ ...base, now: 10_100 })).allowed, 'Second request must be allowed');
    const denied = await store.consume({ ...base, now: 10_200 });
    assert(!denied.allowed, 'Third request must be denied');
    assert((denied.retryAfterSeconds ?? 0) === 1, 'Denied request must return remaining retry window');

    const otherScope = await store.consume({
      ...base,
      scope: 'mutation',
      now: 10_200,
    });
    assert(otherScope.allowed, 'Different scope must use an independent counter');

    const otherAccount = await store.consume({
      ...base,
      accountId: 'limit-account-b',
      now: 10_200,
    });
    assert(otherAccount.allowed, 'Different account must use an independent counter');

    const reset = await store.consume({ ...base, now: 11_000 });
    assert(reset.allowed, 'Expired window must reset atomically');
    const row = database.prepare(`
      SELECT consumed_count, window_started_at, expires_at
      FROM chat_rate_limits
      WHERE scope = 'create' AND account_id = 'limit-account-a'
    `).get() as { consumed_count: number; window_started_at: number; expires_at: number };
    assert(row.consumed_count === 1, 'Reset window must restart consumed count at one');
    assert(row.window_started_at === 11_000 && row.expires_at === 12_000, 'Reset window timestamps must be replaced');

    console.log('ARVELIS SQLite chat rate-limit smoke: PASS');
  } finally {
    database.close();
  }
}

void main();
