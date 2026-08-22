const SERVER_ONLY_PREFIXES = ['AUTH_', 'SMTP_'];
const SERVER_ONLY_KEYS = new Set(['DATABASE_URL', 'SESSION_SECRET']);

export function closedTestRealAuthRequested(argv = process.argv) {
  return argv.includes('--closed-test-real-auth');
}

export function assertClosedTestLaunchAllowed(enabled, env = process.env) {
  if (!enabled) return;
  if (env.NODE_ENV === 'production') {
    throw new Error('Closed-test real-auth runtime is disabled when NODE_ENV=production');
  }
}

export function buildFrontendEnv(sourceEnv = process.env, realAuthEnabled = false) {
  const frontendEnv = { ...sourceEnv };

  for (const key of Object.keys(frontendEnv)) {
    if (SERVER_ONLY_KEYS.has(key) || SERVER_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete frontendEnv[key];
    }
  }

  frontendEnv.VITE_REAL_AUTH_ENABLED = realAuthEnabled ? 'true' : 'false';
  return frontendEnv;
}
