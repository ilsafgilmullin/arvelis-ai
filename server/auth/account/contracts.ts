export type AccountStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

export type AccountRecord = {
  id: string;
  status: AccountStatus;
  securityVersion: number;
  createdAt: number;
  updatedAt: number;
};

export type EmailIdentityRecord = {
  id: string;
  accountId: string;
  kind: 'email_otp';
  canonicalEmail: string;
  verifiedAt: number;
  linkedAt: number;
  lastAuthenticatedAt: number | null;
  disabledAt: number | null;
};

export type CreateAccountWithEmailIdentityInput = {
  accountId: string;
  identityId: string;
  canonicalEmail: string;
  verifiedAt: number;
  createdAt: number;
};

export type CreateAccountWithEmailIdentityResult =
  | {
      status: 'created';
      account: AccountRecord;
      identity: EmailIdentityRecord;
    }
  | {
      status: 'email_conflict';
      identity: EmailIdentityRecord;
    };

/**
 * Account + identity creation must be atomic in the production adapter.
 * Email conflict is returned explicitly; this contract intentionally does not
 * decide the user-facing sign_up/sign_in conflict policy.
 */
export interface AccountIdentityStore {
  findEmailIdentity(canonicalEmail: string): Promise<EmailIdentityRecord | null>;
  getAccount(accountId: string): Promise<AccountRecord | null>;
  createAccountWithEmailIdentity(
    input: CreateAccountWithEmailIdentityInput,
  ): Promise<CreateAccountWithEmailIdentityResult>;
  markIdentityAuthenticated(identityId: string, authenticatedAt: number): Promise<boolean>;
}

export type AccountAuthenticationSnapshot = {
  id: string;
  status: AccountStatus;
  securityVersion: number;
};

/** Minimal read port required by the Session Core. */
export interface AccountAuthenticationReader {
  getAuthenticationSnapshot(accountId: string): Promise<AccountAuthenticationSnapshot | null>;
}
