import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PASS_MARKER = 'travel browser server-persistence happy-path: PASS';
const TIMEOUT_MS = 90_000;

const child = spawn(process.execPath, ['--experimental-sqlite', 'tests/travel-browser-acceptance.mjs'], {
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
let settled = false;

function killGroup() {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // The group may already be gone after a clean exit.
  }
}

function succeed() {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  killGroup();
  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  console.log('travel browser acceptance runner: PASS');
}

function fail(message) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  killGroup();
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  throw new Error(message);
}

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  if (stdout.includes(PASS_MARKER)) succeed();
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

child.on('error', (error) => fail(`Unable to start browser acceptance: ${error.message}`));
child.on('exit', (code, signal) => {
  if (settled) return;
  if (stdout.includes(PASS_MARKER)) {
    succeed();
    return;
  }
  fail(`Browser acceptance exited before PASS (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
});

const timeout = setTimeout(() => {
  fail(`Browser acceptance exceeded ${TIMEOUT_MS / 1000}s without PASS`);
}, TIMEOUT_MS);

await new Promise((resolve) => {
  const interval = setInterval(() => {
    if (settled) {
      clearInterval(interval);
      resolve();
    }
  }, 50);
});

assert.equal(settled, true);
