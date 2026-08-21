import type { AccountRecord, EmailIdentityRecord } from '../account/contracts';
import type { VerifiedEmailOtpProof } from '../emailOtp/contracts';
import type { IssuedServerSession, SessionIssueInput, SessionIssueResult } from '../session/contracts';

export type AccountAuthFailureCode =
  | 'invalid_input'
  | 'account_exists'
  | 'account_not_found'
  | 'account_locked'
  | 'service_unavailable';

export type CompleteVerifiedEmailInput = {
  proof: VerifiedEmailOtpProof;
  displayName?: string;
  deviceLabel?: string;
  browserLabel?: string;
};

export type CompleteVerifiedEmailSuccess = {
  account: AccountRecord;
  identity: EmailIdentityRecord;
  session: IssuedServerSession;
};

export type CompleteVerifiedEmailResult =
  | { ok: true; value: CompleteVerifiedEmailSuccess }
  | { ok: false; error: AccountAuthFailureCode };

export interface AccountSessionIssuer {
  issue(input: SessionIssueInput): Promise<SessionIssueResult>;
}

export interface AccountIdentityIdFactory {
  accountId(): string;
  identityId(): string;
}
