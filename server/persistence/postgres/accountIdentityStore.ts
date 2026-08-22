import type { Pool, PoolClient } from 'pg';
import type {
  AccountAuthenticationReader,
  AccountAuthenticationSnapshot,
  AccountIdentityStore,
  AccountRecord,
  CreateAccountWithEmailIdentityInput,
  CreateAccountWithEmailIdentityResult,
  EmailIdentityRecord,
} from '../../auth/account/contracts';
import { accountFromRow, identityFromRow, type AccountRow, type EmailIdentityRow } from './rows';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original database failure.
  }
}

export class PostgresAccountIdentityStore implements AccountIdentityStore, AccountAuthenticationReader {
  constructor(private readonly pool: Pool) {}

  async findEmailIdentity(canonicalEmail: string): Promise<EmailIdentityRecord | null> {
    const result = await this.pool.query<EmailIdentityRow>(`
      SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
      FROM auth_email_identities
      WHERE canonical_email = $1
      LIMIT 1
    `, [canonicalEmail]);
    const row = result.rows[0];
    return row ? identityFromRow(row) : null;
  }

  async findEmailIdentityForAccount(accountId: string): Promise<EmailIdentityRecord | null> {
    const result = await this.pool.query<EmailIdentityRow>(`
      SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
      FROM auth_email_identities
      WHERE account_id = $1 AND disabled_at IS NULL
      ORDER BY linked_at ASC
      LIMIT 1
    `, [accountId]);
    const row = result.rows[0];
    return row ? identityFromRow(row) : null;
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const result = await this.pool.query<AccountRow>(`
      SELECT id, display_name, status, security_version, created_at, updated_at
      FROM auth_accounts
      WHERE id = $1
      LIMIT 1
    `, [accountId]);
    const row = result.rows[0];
    return row ? accountFromRow(row) : null;
  }

  async getAuthenticationSnapshot(accountId: string): Promise<AccountAuthenticationSnapshot | null> {
    const account = await this.getAccount(accountId);
    return account ? { id: account.id, status: account.status, securityVersion: account.securityVersion } : null;
  }

  async createAccountWithEmailIdentity(
    input: CreateAccountWithEmailIdentityInput,
  ): Promise<CreateAccountWithEmailIdentityResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<EmailIdentityRow>(`
        SELECT id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
        FROM auth_email_identities
        WHERE canonical_email = $1
        FOR SHARE
      `, [input.canonicalEmail]);
      const existingRow = existing.rows[0];
      if (existingRow) {
        await client.query('ROLLBACK');
        return { status: 'email_conflict', identity: identityFromRow(existingRow) };
      }

      const accountResult = await client.query<AccountRow>(`
        INSERT INTO auth_accounts (id, display_name, status, security_version, created_at, updated_at)
        VALUES ($1, $2, 'active', 1, $3, $3)
        RETURNING id, display_name, status, security_version, created_at, updated_at
      `, [input.accountId, input.displayName, input.createdAt]);
      const identityResult = await client.query<EmailIdentityRow>(`
        INSERT INTO auth_email_identities (
          id, account_id, kind, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
        ) VALUES ($1, $2, 'email_otp', $3, $4, $5, $4, NULL)
        RETURNING id, account_id, canonical_email, verified_at, linked_at, last_authenticated_at, disabled_at
      `, [input.identityId, input.accountId, input.canonicalEmail, input.verifiedAt, input.createdAt]);

      const accountRow = accountResult.rows[0];
      const identityRow = identityResult.rows[0];
      if (!accountRow || !identityRow) throw new Error('Atomic account creation returned no rows');

      await client.query('COMMIT');
      return {
        status: 'created',
        account: accountFromRow(accountRow),
        identity: identityFromRow(identityRow),
      };
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) {
        const identity = await this.findEmailIdentity(input.canonicalEmail);
        if (identity) return { status: 'email_conflict', identity };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async markIdentityAuthenticated(identityId: string, authenticatedAt: number): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE auth_email_identities
      SET last_authenticated_at = $2
      WHERE id = $1 AND disabled_at IS NULL
    `, [identityId, authenticatedAt]);
    return result.rowCount === 1;
  }
}
