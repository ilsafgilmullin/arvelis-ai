import { AccountAuthApplicationService } from '../server/auth/application/service';
import type { EmailOtpDelivery, EmailOtpDeliveryPort } from '../server/auth/emailOtp/contracts';
import { EmailOtpService } from '../server/auth/emailOtp/service';
import { WebCryptoEmailOtpSecurity } from '../server/auth/emailOtp/webCryptoSecurity';
import { SessionService } from '../server/auth/session/service';
import { WebCryptoSessionSecurity } from '../server/auth/session/webCryptoSecurity';
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

class CaptureDelivery implements EmailOtpDeliveryPort {
  last: EmailOtpDelivery | null = null;

  async sendCode(delivery: EmailOtpDelivery): Promise<void> {
    this.last = { ...delivery };
  }

  takeCode(): string {
    const delivery = this.last;
    this.last = null;
    if (!delivery) throw new Error('No captured OTP delivery');
    return delivery.code;
  }
}

async function main(): Promise<void> {
  const database = openSqliteAuthDatabase(':memory:');

  try {
    const accounts = new SqliteAccountIdentityStore(database);
    const challengeStore = new SqliteEmailOtpChallengeStore(database);
    const rateLimit = new SqliteEmailOtpRateLimitStore(database);
    const sessionStore = new SqliteSessionStore(database);
    const delivery = new CaptureDelivery();
    const otpSecurity = new WebCryptoEmailOtpSecurity(new Uint8Array(32).fill(0x11));
    const sessionSecurity = new WebCryptoSessionSecurity(new Uint8Array(32).fill(0x22));
    let now = 1_000_000;

    const otp = new EmailOtpService({
      store: challengeStore,
      delivery,
      rateLimit,
      security: otpSecurity,
      now: () => now,
    });
    const sessions = new SessionService({
      store: sessionStore,
      accounts,
      security: sessionSecurity,
      now: () => now,
    });
    const auth = new AccountAuthApplicationService({
      accounts,
      sessions,
      now: () => now,
    });

    const signUpStart = await otp.start({
      intent: 'sign_up',
      email: 'owner.test@Example.TEST',
      clientKey: 'sqlite-flow-client',
    });
    assert(signUpStart.ok, 'Sign-up OTP start must succeed through SQLite');
    const signUpCode = delivery.takeCode();
    const signUpProof = await otp.verify({
      challengeId: signUpStart.challenge.challengeId,
      code: signUpCode,
      clientKey: 'sqlite-flow-client',
    });
    assert(signUpProof.ok, 'Sign-up OTP must verify through SQLite');

    const signUp = await auth.complete({
      proof: signUpProof.proof,
      displayName: 'Ильсаф',
      deviceLabel: 'iPhone',
      browserLabel: 'Safari',
    });
    assert(signUp.ok, 'Verified email must create Account + Session through SQLite');
    assert(signUp.value.account.displayName === 'Ильсаф', 'Account display name must persist');
    assert(signUp.value.identity.canonicalEmail === 'owner.test@example.test', 'Email domain must be canonicalized');

    const restored = await sessions.authenticate({
      sessionId: signUp.value.session.sessionId,
      secret: signUp.value.session.secret,
    });
    assert(restored.ok, 'Issued SQLite-backed session must authenticate');
    assert(restored.session.account.id === signUp.value.account.id, 'Restored session must remain account-scoped');

    now += 1_000;
    const signInStart = await otp.start({
      intent: 'sign_in',
      email: 'owner.test@example.test',
      clientKey: 'sqlite-flow-client',
    });
    assert(signInStart.ok, 'Existing account sign-in OTP start must succeed');
    const signInProof = await otp.verify({
      challengeId: signInStart.challenge.challengeId,
      code: delivery.takeCode(),
      clientKey: 'sqlite-flow-client',
    });
    assert(signInProof.ok, 'Existing account sign-in OTP must verify');

    const signIn = await auth.complete({
      proof: signInProof.proof,
      deviceLabel: 'iPhone',
      browserLabel: 'Safari',
    });
    assert(signIn.ok, 'Existing verified email must sign in');
    assert(signIn.value.account.id === signUp.value.account.id, 'Sign-in must resolve the existing immutable Account ID');

    now += 1_000;
    const duplicateStart = await otp.start({
      intent: 'sign_up',
      email: 'owner.test@example.test',
      clientKey: 'sqlite-flow-client',
    });
    assert(duplicateStart.ok, 'Enumeration-resistant sign-up start must still issue a challenge');
    const duplicateProof = await otp.verify({
      challengeId: duplicateStart.challenge.challengeId,
      code: delivery.takeCode(),
      clientKey: 'sqlite-flow-client',
    });
    assert(duplicateProof.ok, 'Existing-email ownership must be verified before conflict disclosure');
    const duplicate = await auth.complete({
      proof: duplicateProof.proof,
      displayName: 'Другой пользователь',
    });
    assert(!duplicate.ok && duplicate.error === 'account_exists', 'Verified duplicate sign-up must return account_exists');

    now += 1_000;
    const unknownStart = await otp.start({
      intent: 'sign_in',
      email: 'unknown@example.test',
      clientKey: 'sqlite-flow-client',
    });
    assert(unknownStart.ok, 'Enumeration-resistant unknown sign-in start must still issue a challenge');
    const unknownProof = await otp.verify({
      challengeId: unknownStart.challenge.challengeId,
      code: delivery.takeCode(),
      clientKey: 'sqlite-flow-client',
    });
    assert(unknownProof.ok, 'Unknown-email ownership must be verified before account lookup disclosure');
    const unknown = await auth.complete({ proof: unknownProof.proof });
    assert(!unknown.ok && unknown.error === 'account_not_found', 'Verified unknown sign-in must return account_not_found');

    const activeSessions = await sessions.listForAccount(signUp.value.account.id, signIn.value.session.sessionId);
    assert(activeSessions.ok && activeSessions.sessions.length === 2, 'Both issued sessions must be server-side and account-scoped');
    assert(activeSessions.sessions.filter((session) => session.current).length === 1, 'Exactly one listed session must be marked current');

    const revoked = await sessions.revokeOwned(signUp.value.account.id, signUp.value.session.sessionId, 'user_revoke');
    assert(revoked.ok && revoked.revoked, 'Owned session revoke must succeed');
    const revokedRestore = await sessions.authenticate({
      sessionId: signUp.value.session.sessionId,
      secret: signUp.value.session.secret,
    });
    assert(!revokedRestore.ok && revokedRestore.error === 'invalid_session', 'Revoked session must fail closed');

    console.log('ARVELIS SQLite auth flow smoke: PASS');
  } finally {
    database.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'SQLite auth flow smoke failed');
  process.exitCode = 1;
});
