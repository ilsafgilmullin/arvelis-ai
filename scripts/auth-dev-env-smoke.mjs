import assert from 'node:assert/strict';
import {
  assertClosedTestLaunchAllowed,
  buildFrontendEnv,
  closedTestRealAuthRequested,
} from './auth-dev-env.mjs';

assert.equal(closedTestRealAuthRequested(['node', 'script.mjs']), false);
assert.equal(closedTestRealAuthRequested(['node', 'script.mjs', '--closed-test-real-auth']), true);

const source = {
  PATH: '/usr/bin',
  NODE_ENV: 'development',
  AUTH_OTP_PEPPER_HEX: 'otp-secret',
  AUTH_SESSION_PEPPER_HEX: 'session-secret',
  AUTH_API_PORT: '3001',
  SMTP_PASSWORD: 'smtp-secret',
  SMTP_USERNAME: 'arvelis.auth',
  DATABASE_URL: 'postgresql://secret',
  SESSION_SECRET: 'legacy-secret',
  VITE_PUBLIC_SAMPLE: 'visible',
  VITE_REAL_AUTH_ENABLED: 'false',
};

const enabled = buildFrontendEnv(source, true);
assert.equal(enabled.PATH, '/usr/bin');
assert.equal(enabled.NODE_ENV, 'development');
assert.equal(enabled.VITE_PUBLIC_SAMPLE, 'visible');
assert.equal(enabled.VITE_REAL_AUTH_ENABLED, 'true');
assert.equal('AUTH_OTP_PEPPER_HEX' in enabled, false);
assert.equal('AUTH_SESSION_PEPPER_HEX' in enabled, false);
assert.equal('AUTH_API_PORT' in enabled, false);
assert.equal('SMTP_PASSWORD' in enabled, false);
assert.equal('SMTP_USERNAME' in enabled, false);
assert.equal('DATABASE_URL' in enabled, false);
assert.equal('SESSION_SECRET' in enabled, false);

const disabled = buildFrontendEnv(source, false);
assert.equal(disabled.VITE_REAL_AUTH_ENABLED, 'false');

assert.doesNotThrow(() => assertClosedTestLaunchAllowed(true, { NODE_ENV: 'development' }));
assert.doesNotThrow(() => assertClosedTestLaunchAllowed(false, { NODE_ENV: 'production' }));
assert.throws(
  () => assertClosedTestLaunchAllowed(true, { NODE_ENV: 'production' }),
  /disabled when NODE_ENV=production/,
);

console.log('ARVELIS closed-test auth dev environment smoke: PASS');
