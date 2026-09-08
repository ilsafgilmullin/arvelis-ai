import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import type { AccountAuthenticationReader, AccountIdentityStore } from '../auth/account/contracts';
import { AccountAuthApplicationService } from '../auth/application/service';
import type { EmailOtpChallengeStore, EmailOtpFailure, EmailOtpRateLimitPort } from '../auth/emailOtp/contracts';
import { SmtpEmailOtpDelivery } from '../auth/emailOtp/smtpDelivery';
import { EmailOtpService } from '../auth/emailOtp/service';
import { WebCryptoEmailOtpSecurity } from '../auth/emailOtp/webCryptoSecurity';
import type { SessionStore } from '../auth/session/contracts';
import { SessionService } from '../auth/session/service';
import { WebCryptoSessionSecurity } from '../auth/session/webCryptoSecurity';
import { PostgresAccountIdentityStore } from '../persistence/postgres/accountIdentityStore';
import { PostgresEmailOtpChallengeStore } from '../persistence/postgres/emailOtpChallengeStore';
import { PostgresEmailOtpRateLimitStore } from '../persistence/postgres/rateLimitStore';
import { PostgresSessionStore } from '../persistence/postgres/sessionStore';
import { PostgresTripStore } from '../persistence/postgres/tripStore';
import {
  SqliteAccountIdentityStore,
  SqliteEmailOtpChallengeStore,
  SqliteEmailOtpRateLimitStore,
  SqliteSessionStore,
} from '../persistence/sqlite/authStores';
import { openSqliteAuthDatabase } from '../persistence/sqlite/database';
import { SqliteTripStore } from '../persistence/sqlite/tripStore';
import { TripApplicationError, type ServerTripStore } from '../travel/contracts';
import { TripApplicationService } from '../travel/service';
import { loadAuthRuntimeConfig } from './config';
import {
  getClientKey,
  getCoarseDeviceMetadata,
  isTrustedSameOriginMutation,
  readJsonObject,
  readSessionCookie,
  sendJson,
  sendNoContent,
  sessionClearCookie,
  sessionSetCookie,
} from './http';

const EMAIL_METHOD_ID = 'email_otp';
const TRIP_JSON_LIMIT = 256 * 1024;

type RuntimeAccounts = AccountIdentityStore & AccountAuthenticationReader;

type RequestAuthentication =
  | { kind: 'signed_out' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
  | {
      kind: 'authenticated';
      credential: { sessionId: string; secret: string };
      authenticated: Awaited<ReturnType<SessionService['authenticate']>> extends { ok: true; session: infer T } ? T : never;
      publicSession: {
        id: string;
        account: {
          id: string;
          displayName: string;
          primaryEmail: string;
          emailVerified: boolean;
          phoneVerified: boolean;
        };
        createdAt: string;
        expiresAt: string;
      };
    };

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function authFailure(code: string, message: string, retryAfterSeconds?: number) {
  return retryAfterSeconds === undefined
    ? { code, message }
    : { code, message, retryAfterSeconds };
}

function mapOtpFailure(error: EmailOtpFailure) {
  switch (error.code) {
    case 'rate_limited':
      return authFailure('rate_limited', 'Too many requests', error.retryAfterSeconds);
    case 'challenge_expired':
      return authFailure('challenge_expired', 'Challenge expired');
    case 'invalid_code':
    case 'invalid_challenge':
      return authFailure('invalid_challenge', 'Invalid challenge');
    case 'too_many_attempts':
      return authFailure('rate_limited', 'Too many attempts');
    case 'invalid_input':
      return authFailure('invalid_input', 'Invalid input');
    case 'delivery_unavailable':
    case 'service_unavailable':
    default:
      return authFailure('service_unavailable', 'Auth service unavailable');
  }
}

function mapAccountFailure(code: string) {
  switch (code) {
    case 'account_exists':
      return authFailure('account_exists', 'Account already exists');
    case 'account_not_found':
      return authFailure('account_not_found', 'Account not found');
    case 'account_locked':
      return authFailure('account_locked', 'Account unavailable');
    case 'invalid_input':
      return authFailure('invalid_input', 'Invalid input');
    default:
      return authFailure('service_unavailable', 'Auth service unavailable');
  }
}

function tripIdFromPath(pathname: string): string | null {
  const prefix = '/api/trips/';
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.includes('/')) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const config = loadAuthRuntimeConfig();

  let pool: Pool | null = null;
  let sqlite: DatabaseSync | null = null;
  let accounts: RuntimeAccounts;
  let challengeStore: EmailOtpChallengeStore;
  let rateLimits: EmailOtpRateLimitPort;
  let sessionStore: SessionStore;
  let tripStore: ServerTripStore;

  if (config.database.provider === 'postgres') {
    pool = new Pool({
      connectionString: config.database.url,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });

    await pool.query('SELECT 1');
    const schema = await pool.query<{ accounts: string | null; trips: string | null }>(`
      SELECT
        to_regclass('public.auth_accounts')::text AS accounts,
        to_regclass('public.travel_trips')::text AS trips
    `);
    if (!schema.rows[0]?.accounts || !schema.rows[0]?.trips) {
      throw new Error('ARVELIS database migrations are not fully applied');
    }

    accounts = new PostgresAccountIdentityStore(pool);
    challengeStore = new PostgresEmailOtpChallengeStore(pool);
    rateLimits = new PostgresEmailOtpRateLimitStore(pool);
    sessionStore = new PostgresSessionStore(pool);
    tripStore = new PostgresTripStore(pool);
  } else {
    sqlite = openSqliteAuthDatabase(config.database.path);
    accounts = new SqliteAccountIdentityStore(sqlite);
    challengeStore = new SqliteEmailOtpChallengeStore(sqlite);
    rateLimits = new SqliteEmailOtpRateLimitStore(sqlite);
    sessionStore = new SqliteSessionStore(sqlite);
    tripStore = new SqliteTripStore(sqlite);
  }

  const delivery = new SmtpEmailOtpDelivery(config.smtp);
  const otpSecurity = new WebCryptoEmailOtpSecurity(config.otpPepper);
  const sessionSecurity = new WebCryptoSessionSecurity(config.sessionPepper);
  config.otpPepper.fill(0);
  config.sessionPepper.fill(0);

  const otp = new EmailOtpService({
    store: challengeStore,
    delivery,
    rateLimit: rateLimits,
    security: otpSecurity,
  });
  const sessions = new SessionService({
    store: sessionStore,
    accounts,
    security: sessionSecurity,
  });
  const accountAuth = new AccountAuthApplicationService({ accounts, sessions });
  const trips = new TripApplicationService(tripStore);

  const buildPublicSession = async (sessionId: string, createdAt: number, expiresAt: number, accountId: string) => {
    const account = await accounts.getAccount(accountId);
    if (!account || account.status !== 'active') return null;
    const identity = await accounts.findEmailIdentityForAccount(account.id);
    if (!identity || identity.disabledAt !== null) return null;

    return {
      id: sessionId,
      account: {
        id: account.id,
        displayName: account.displayName,
        primaryEmail: identity.canonicalEmail,
        emailVerified: true,
        phoneVerified: false,
      },
      createdAt: iso(createdAt),
      expiresAt: iso(expiresAt),
    };
  };

  const authenticateRequest = async (request: IncomingMessage): Promise<RequestAuthentication> => {
    const credential = readSessionCookie(request);
    if (!credential) return { kind: 'signed_out' };

    const authenticated = await sessions.authenticate(credential);
    if (!authenticated.ok) {
      if (authenticated.error === 'service_unavailable') return { kind: 'unavailable' };
      return { kind: 'invalid' };
    }

    const publicSession = await buildPublicSession(
      authenticated.session.sessionId,
      authenticated.session.createdAt,
      authenticated.session.expiresAt,
      authenticated.session.account.id,
    );
    if (!publicSession) return { kind: 'invalid' };

    return {
      kind: 'authenticated',
      credential,
      authenticated: authenticated.session,
      publicSession,
    };
  };

  const requireTripAccount = async (request: IncomingMessage, response: ServerResponse) => {
    const current = await authenticateRequest(request);
    if (current.kind === 'authenticated') return current;
    if (current.kind === 'unavailable') {
      sendJson(response, 503, { error: authFailure('service_unavailable', 'Service unavailable') });
      return null;
    }
    sendJson(
      response,
      401,
      { error: authFailure('access_denied', 'Authentication required') },
      current.kind === 'invalid' ? { 'Set-Cookie': sessionClearCookie(request, config.cookieSecureMode) } : undefined,
    );
    return null;
  };

  const handler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if ((method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
      && !isTrustedSameOriginMutation(request)) {
      sendJson(response, 403, { error: authFailure('access_denied', 'Request origin rejected') });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'arvelis-auth',
        persistence: config.database.provider,
        trips: 'account_scoped',
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/methods') {
      sendJson(response, 200, [{
        id: EMAIL_METHOD_ID,
        kind: 'identifier',
        label: 'Email',
        enabled: true,
        identifierType: 'email',
      }]);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/session') {
      const current = await authenticateRequest(request);
      if (current.kind === 'unavailable') {
        sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        return;
      }
      if (current.kind === 'authenticated') {
        sendJson(response, 200, current.publicSession);
        return;
      }

      const headers = current.kind === 'invalid'
        ? { 'Set-Cookie': sessionClearCookie(request, config.cookieSecureMode) }
        : undefined;
      sendJson(response, 200, null, headers);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/trips') {
      const current = await requireTripAccount(request, response);
      if (!current) return;
      try {
        sendJson(response, 200, { trips: await trips.list(current.authenticated.account.id) });
      } catch {
        sendJson(response, 503, { error: authFailure('service_unavailable', 'Trip service unavailable') });
      }
      return;
    }

    const tripId = tripIdFromPath(url.pathname);
    if (method === 'GET' && tripId !== null) {
      const current = await requireTripAccount(request, response);
      if (!current) return;
      try {
        const trip = await trips.get(current.authenticated.account.id, tripId);
        if (!trip) {
          sendJson(response, 404, { error: authFailure('not_found', 'Trip not found') });
          return;
        }
        sendJson(response, 200, { trip });
      } catch (error) {
        if (error instanceof TripApplicationError && error.code === 'invalid_input') {
          sendJson(response, 400, { error: authFailure('invalid_input', 'Invalid trip id') });
        } else {
          sendJson(response, 503, { error: authFailure('service_unavailable', 'Trip service unavailable') });
        }
      }
      return;
    }

    if (method === 'PUT' && tripId !== null) {
      const current = await requireTripAccount(request, response);
      if (!current) return;
      let body: Record<string, unknown>;
      try {
        body = await readJsonObject(request, TRIP_JSON_LIMIT);
      } catch {
        sendJson(response, 400, { error: authFailure('invalid_input', 'Invalid Trip request') });
        return;
      }

      try {
        const saved = await trips.save(current.authenticated.account.id, tripId, body.trip);
        sendJson(response, 200, { trip: saved });
      } catch (error) {
        if (error instanceof TripApplicationError) {
          const status = error.code === 'access_denied' ? 403 : 400;
          sendJson(response, status, { error: authFailure(error.code, error.code === 'access_denied' ? 'Trip ownership rejected' : 'Invalid Trip request') });
        } else {
          sendJson(response, 503, { error: authFailure('service_unavailable', 'Trip service unavailable') });
        }
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/start') {
      let body: Record<string, unknown>;
      try {
        body = await readJsonObject(request);
      } catch {
        sendJson(response, 400, { ok: false, error: authFailure('invalid_input', 'Invalid request') });
        return;
      }

      if ((body.intent !== 'sign_in' && body.intent !== 'sign_up')
        || body.methodId !== EMAIL_METHOD_ID
        || typeof body.identifier !== 'string') {
        sendJson(response, 400, { ok: false, error: authFailure('invalid_input', 'Invalid request') });
        return;
      }

      const clientKey = getClientKey(request, config.trustProxy);
      const started = await otp.start({
        intent: body.intent,
        email: body.identifier,
        ...(clientKey === undefined ? {} : { clientKey }),
      });
      if (!started.ok) {
        const error = mapOtpFailure(started.error);
        sendJson(response, error.code === 'rate_limited' ? 429 : 400, { ok: false, error });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        challenge: {
          id: started.challenge.challengeId,
          methodId: EMAIL_METHOD_ID,
          kind: 'code',
          maskedDestination: started.challenge.maskedDestination,
          expiresAt: started.challenge.expiresAt,
        },
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/complete') {
      let body: Record<string, unknown>;
      try {
        body = await readJsonObject(request);
      } catch {
        sendJson(response, 400, { ok: false, error: authFailure('invalid_input', 'Invalid request') });
        return;
      }

      if (typeof body.challengeId !== 'string' || typeof body.response !== 'string'
        || (body.displayName !== undefined && typeof body.displayName !== 'string')) {
        sendJson(response, 400, { ok: false, error: authFailure('invalid_input', 'Invalid request') });
        return;
      }

      const clientKey = getClientKey(request, config.trustProxy);
      const verified = await otp.verify({
        challengeId: body.challengeId,
        code: body.response,
        ...(clientKey === undefined ? {} : { clientKey }),
      });
      if (!verified.ok) {
        const error = mapOtpFailure(verified.error);
        sendJson(response, error.code === 'rate_limited' ? 429 : 400, { ok: false, error });
        return;
      }

      const metadata = getCoarseDeviceMetadata(request);
      const completed = await accountAuth.complete({
        proof: verified.proof,
        ...(typeof body.displayName === 'string' ? { displayName: body.displayName } : {}),
        ...metadata,
      });
      if (!completed.ok) {
        const error = mapAccountFailure(completed.error);
        const status = completed.error === 'account_locked' ? 403
          : completed.error === 'service_unavailable' ? 503
            : 409;
        sendJson(response, status, { ok: false, error });
        return;
      }

      const publicSession = await buildPublicSession(
        completed.value.session.sessionId,
        completed.value.session.createdAt,
        completed.value.session.expiresAt,
        completed.value.account.id,
      );
      if (!publicSession) {
        sendJson(response, 503, { ok: false, error: authFailure('service_unavailable', 'Auth service unavailable') });
        return;
      }

      const cookie = sessionSetCookie(request, {
        sessionId: completed.value.session.sessionId,
        secret: completed.value.session.secret,
      }, completed.value.session.expiresAt, config.cookieSecureMode);
      sendJson(response, 200, { ok: true, session: publicSession }, { 'Set-Cookie': cookie });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/sign-out') {
      const current = await authenticateRequest(request);
      if (current.kind === 'unavailable') {
        sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        return;
      }
      if (current.kind === 'authenticated') {
        const revoked = await sessions.revokeOwned(
          current.authenticated.account.id,
          current.authenticated.sessionId,
          'user_sign_out',
        );
        if (!revoked.ok) {
          sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
          return;
        }
      }

      sendNoContent(response, { 'Set-Cookie': sessionClearCookie(request, config.cookieSecureMode) });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/sessions') {
      const current = await authenticateRequest(request);
      if (current.kind !== 'authenticated') {
        if (current.kind === 'unavailable') {
          sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        } else {
          sendJson(response, 401, { error: authFailure('access_denied', 'Authentication required') },
            current.kind === 'invalid' ? { 'Set-Cookie': sessionClearCookie(request, config.cookieSecureMode) } : undefined);
        }
        return;
      }

      const listed = await sessions.listForAccount(current.authenticated.account.id, current.authenticated.sessionId);
      if (!listed.ok) {
        sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        return;
      }

      sendJson(response, 200, listed.sessions.map((session) => ({
        id: session.id,
        current: session.current,
        createdAt: iso(session.createdAt),
        lastSeenAt: iso(session.lastSeenAt),
        expiresAt: iso(session.expiresAt),
        ...(session.deviceLabel === null ? {} : { deviceLabel: session.deviceLabel }),
        ...(session.browserLabel === null ? {} : { browserLabel: session.browserLabel }),
      })));
      return;
    }

    const revokeMatch = /^\/api\/auth\/sessions\/([a-f0-9]{32})$/.exec(url.pathname);
    if (method === 'DELETE' && revokeMatch?.[1]) {
      const current = await authenticateRequest(request);
      if (current.kind !== 'authenticated') {
        if (current.kind === 'unavailable') {
          sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        } else {
          sendJson(response, 401, { error: authFailure('access_denied', 'Authentication required') });
        }
        return;
      }

      const targetSessionId = revokeMatch[1];
      const revoked = await sessions.revokeOwned(current.authenticated.account.id, targetSessionId);
      if (!revoked.ok) {
        sendJson(response, 503, { error: authFailure('service_unavailable', 'Auth service unavailable') });
        return;
      }

      const headers = targetSessionId === current.authenticated.sessionId && revoked.revoked
        ? { 'Set-Cookie': sessionClearCookie(request, config.cookieSecureMode) }
        : undefined;
      sendNoContent(response, headers);
      return;
    }

    sendJson(response, 404, { error: authFailure('invalid_input', 'Route not found') });
  };

  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: authFailure('service_unavailable', 'Service unavailable') });
      } else {
        response.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', () => resolve());
  });
  console.log(`ARVELIS API listening on 127.0.0.1:${config.port} (${config.database.provider})`);

  const shutdown = async () => {
    server.close();
    if (pool) await pool.end();
    if (sqlite) sqlite.close();
  };
  process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
}

void main().catch(() => {
  console.error('ARVELIS API failed to start');
  process.exitCode = 1;
});
