import type {
  AccountAuthenticationSnapshot,
  AccountIdentityStore,
  AccountRecord,
  CreateAccountWithEmailIdentityInput,
  CreateAccountWithEmailIdentityResult,
  EmailIdentityRecord,
} from '../server/auth/account/contracts';
import { AccountAuthApplicationService } from '../server/auth/application/service';
import type { AccountSessionIssuer } from '../server/auth/application/contracts';
import type { SessionIssueInput, SessionIssueResult } from '../server/auth/session/contracts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function cloneAccount(account: AccountRecord): AccountRecord {
  return { ...account };
}

function cloneIdentity(identity: EmailIdentityRecord): EmailIdentityRecord {
  return { ...identity };
}

class MemoryAccountStore implements AccountIdentityStore {
  readonly accounts = new Map<string, AccountRecord>();
  readonly identities = new Map<string, EmailIdentityRecord>();

  async findEmailIdentity(canonicalEmail: string): Promise<EmailIdentityRecord | null> {
    const identity = [...this.identities.values()].find((candidate) => candidate.canonicalEmail === canonicalEmail);
    return identity ? cloneIdentity(identity) : null;
  }

  async findEmailIdentityForAccount(accountId: string): Promise<EmailIdentityRecord | null> {
    const identity = [...this.identities.values()].find((candidate) => candidate.accountId === accountId && candidate.disabledAt === null);
    return identity ? cloneIdentity(identity) : null;
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const account = this.accounts.get(accountId);
    return account ? cloneAccount(account) : null;
  }

  async createAccountWithEmailIdentity(input: CreateAccountWithEmailIdentityInput): Promise<CreateAccountWithEmailIdentityResult> {
    const existing = await this.findEmailIdentity(input.canonicalEmail);
    if (existing) return { status: 'email_conflict', identity: existing };

    const account: AccountRecord = {
      id: input.accountId,
      displayName: input.displayName,
      status: 'active',
      securityVersion: 1,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    const identity: EmailIdentityRecord = {
      id: input.identityId,
      accountId: account.id,
      kind: 'email_otp',
      canonicalEmail: input.canonicalEmail,
      verifiedAt: input.verifiedAt,
      linkedAt: input.createdAt,
      lastAuthenticatedAt: input.createdAt,
      disabledAt: null,
    };
    this.accounts.set(account.id, cloneAccount(account));
    this.identities.set(identity.id, cloneIdentity(identity));
    return { status: 'created', account, identity };
  }

  async markIdentityAuthenticated(identityId: string, authenticatedAt: number): Promise<boolean> {
    const identity = this.identities.get(identityId);
    if (!identity || identity.disabledAt !== null) return false;
    this.identities.set(identityId, { ...identity, lastAuthenticatedAt: authenticatedAt });
    return true;
  }
}

class FakeSessionIssuer implements AccountSessionIssuer {
  calls: SessionIssueInput[] = [];
  fail = false;

  async issue(input: SessionIssueInput): Promise<SessionIssueResult> {
    this.calls.push({ ...input, account: { ...input.account } });
    if (this.fail) return { ok: false, error: 'service_unavailable' };
    return {
      ok: true,
      session: {
        sessionId: 'a'.repeat(32),
        secret: 'b'.repeat(64),
        createdAt: 1_760_000_000_100,
        expiresAt: 1_760_000_000_100 + 30 * 24 * 60 * 60 * 1000,
      },
    };
  }
}

async function main(): Promise<void> {
  let now = 1_760_000_000_000;
  const store = new MemoryAccountStore();
  const sessions = new FakeSessionIssuer();
  let accountSequence = 0;
  let identitySequence = 0;
  const service = new AccountAuthApplicationService({
    accounts: store,
    sessions,
    now: () => now,
    ids: {
      accountId: () => `acc_test_${++accountSequence}`,
      identityId: () => `idn_test_${++identitySequence}`,
    },
  });

  const signupProof = {
    challengeId: '1'.repeat(32),
    intent: 'sign_up' as const,
    email: 'owner@example.com',
    verifiedAt: now,
  };

  const invalidName = await service.complete({ proof: signupProof, displayName: '   ' });
  assert(!invalidName.ok && invalidName.error === 'invalid_input', 'blank display name was accepted');

  const signup = await service.complete({
    proof: signupProof,
    displayName: '  Ильсаф   ARVELIS  ',
    deviceLabel: 'iPhone',
    browserLabel: 'Safari',
  });
  assert(signup.ok, 'verified signup did not create account/session');
  assert(signup.value.account.displayName === 'Ильсаф ARVELIS', 'display name was not normalized');
  assert(signup.value.identity.canonicalEmail === signupProof.email, 'signup email changed');
  assert(sessions.calls.length === 1, 'signup did not issue exactly one session');

  const duplicateSignup = await service.complete({ proof: { ...signupProof, challengeId: '2'.repeat(32) }, displayName: 'Другой' });
  assert(!duplicateSignup.ok && duplicateSignup.error === 'account_exists', 'duplicate verified signup did not return account_exists');

  const missingSignIn = await service.complete({
    proof: {
      challengeId: '3'.repeat(32),
      intent: 'sign_in',
      email: 'missing@example.com',
      verifiedAt: now,
    },
  });
  assert(!missingSignIn.ok && missingSignIn.error === 'account_not_found', 'unknown verified sign-in did not return account_not_found');

  now += 1_000;
  const signIn = await service.complete({
    proof: {
      challengeId: '4'.repeat(32),
      intent: 'sign_in',
      email: signupProof.email,
      verifiedAt: now,
    },
  });
  assert(signIn.ok, 'existing verified account did not sign in');
  assert(signIn.value.account.id === signup.value.account.id, 'sign-in created/switched account unexpectedly');
  assert(signIn.value.identity.lastAuthenticatedAt === now, 'last authenticated timestamp was not updated');

  const stored = store.accounts.get(signup.value.account.id);
  assert(stored, 'stored account disappeared');
  store.accounts.set(stored.id, { ...stored, status: 'suspended' });

  const suspended = await service.complete({
    proof: {
      challengeId: '5'.repeat(32),
      intent: 'sign_in',
      email: signupProof.email,
      verifiedAt: now,
    },
  });
  assert(!suspended.ok && suspended.error === 'account_locked', 'suspended account authenticated');

  store.accounts.set(stored.id, { ...stored, status: 'active' });
  const identity = [...store.identities.values()].find((candidate) => candidate.accountId === stored.id);
  assert(identity, 'identity disappeared');
  store.identities.set(identity.id, { ...identity, disabledAt: now });

  const disabled = await service.complete({
    proof: {
      challengeId: '6'.repeat(32),
      intent: 'sign_in',
      email: signupProof.email,
      verifiedAt: now,
    },
  });
  assert(!disabled.ok && disabled.error === 'account_locked', 'disabled identity authenticated');

  const accountSnapshot: AccountAuthenticationSnapshot = {
    id: signup.value.account.id,
    status: 'active',
    securityVersion: 1,
  };
  assert(accountSnapshot.id.length > 0, 'account snapshot fixture invalid');

  console.log('ARVELIS account auth application smoke: PASS');
}

void main();
