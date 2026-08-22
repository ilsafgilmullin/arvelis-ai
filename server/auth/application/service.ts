import type { AccountIdentityStore, AccountRecord, EmailIdentityRecord } from '../account/contracts';
import { validateAccountDisplayName } from '../account/displayName';
import type { VerifiedEmailOtpProof } from '../emailOtp/contracts';
import type {
  AccountIdentityIdFactory,
  AccountSessionIssuer,
  CompleteVerifiedEmailInput,
  CompleteVerifiedEmailResult,
} from './contracts';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const UNSAFE_TEXT_PATTERN = /\p{C}/u;

function defaultId(prefix: string): string {
  const value = globalThis.crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${value}`;
}

function validProof(proof: VerifiedEmailOtpProof): boolean {
  return /^[a-f0-9]{32}$/.test(proof.challengeId)
    && (proof.intent === 'sign_in' || proof.intent === 'sign_up')
    && proof.email.length >= 3
    && proof.email.length <= 254
    && proof.email.trim() === proof.email
    && !UNSAFE_TEXT_PATTERN.test(proof.email)
    && Number.isSafeInteger(proof.verifiedAt)
    && proof.verifiedAt >= 0;
}

function snapshot(account: AccountRecord) {
  return {
    id: account.id,
    status: account.status,
    securityVersion: account.securityVersion,
  } as const;
}

export type AccountAuthApplicationServiceDependencies = {
  accounts: AccountIdentityStore;
  sessions: AccountSessionIssuer;
  ids?: AccountIdentityIdFactory;
  now?: () => number;
};

export class AccountAuthApplicationService {
  private readonly accounts: AccountIdentityStore;
  private readonly sessions: AccountSessionIssuer;
  private readonly ids: AccountIdentityIdFactory;
  private readonly now: () => number;

  constructor(dependencies: AccountAuthApplicationServiceDependencies) {
    this.accounts = dependencies.accounts;
    this.sessions = dependencies.sessions;
    this.ids = dependencies.ids ?? {
      accountId: () => defaultId('acc'),
      identityId: () => defaultId('idn'),
    };
    this.now = dependencies.now ?? Date.now;
  }

  async complete(input: CompleteVerifiedEmailInput): Promise<CompleteVerifiedEmailResult> {
    if (!validProof(input.proof)) return { ok: false, error: 'invalid_input' };

    try {
      if (input.proof.intent === 'sign_up') {
        return await this.completeSignUp(input);
      }
      return await this.completeSignIn(input);
    } catch {
      return { ok: false, error: 'service_unavailable' };
    }
  }

  private async completeSignUp(input: CompleteVerifiedEmailInput): Promise<CompleteVerifiedEmailResult> {
    const displayName = validateAccountDisplayName(input.displayName);
    if (!displayName.ok) return { ok: false, error: 'invalid_input' };

    const existingIdentity = await this.accounts.findEmailIdentity(input.proof.email);
    if (existingIdentity) return { ok: false, error: 'account_exists' };

    const accountId = this.ids.accountId();
    const identityId = this.ids.identityId();
    if (!ID_PATTERN.test(accountId) || !ID_PATTERN.test(identityId)) {
      return { ok: false, error: 'service_unavailable' };
    }

    const createdAt = Math.max(this.now(), input.proof.verifiedAt);
    const created = await this.accounts.createAccountWithEmailIdentity({
      accountId,
      identityId,
      displayName: displayName.value,
      canonicalEmail: input.proof.email,
      verifiedAt: input.proof.verifiedAt,
      createdAt,
    });

    if (created.status === 'email_conflict') return { ok: false, error: 'account_exists' };

    return this.issue(created.account, created.identity, input);
  }

  private async completeSignIn(input: CompleteVerifiedEmailInput): Promise<CompleteVerifiedEmailResult> {
    const identity = await this.accounts.findEmailIdentity(input.proof.email);
    if (!identity) return { ok: false, error: 'account_not_found' };
    if (identity.disabledAt !== null) return { ok: false, error: 'account_locked' };

    const account = await this.accounts.getAccount(identity.accountId);
    if (!account || account.status !== 'active') return { ok: false, error: 'account_locked' };

    const authenticatedAt = Math.max(this.now(), input.proof.verifiedAt);
    const marked = await this.accounts.markIdentityAuthenticated(identity.id, authenticatedAt);
    if (!marked) return { ok: false, error: 'service_unavailable' };

    const refreshedIdentity: EmailIdentityRecord = {
      ...identity,
      lastAuthenticatedAt: authenticatedAt,
    };
    return this.issue(account, refreshedIdentity, input);
  }

  private async issue(
    account: AccountRecord,
    identity: EmailIdentityRecord,
    input: CompleteVerifiedEmailInput,
  ): Promise<CompleteVerifiedEmailResult> {
    if (account.status !== 'active') return { ok: false, error: 'account_locked' };

    const issueInput = {
      account: snapshot(account),
      ...(input.deviceLabel === undefined ? {} : { deviceLabel: input.deviceLabel }),
      ...(input.browserLabel === undefined ? {} : { browserLabel: input.browserLabel }),
    };
    const issued = await this.sessions.issue(issueInput);
    if (!issued.ok) {
      return {
        ok: false,
        error: issued.error === 'account_unavailable' ? 'account_locked' : 'service_unavailable',
      };
    }

    return {
      ok: true,
      value: {
        account,
        identity,
        session: issued.session,
      },
    };
  }
}
