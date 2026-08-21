import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const node = process.execPath;
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const vite = resolve(root, 'node_modules/vite/bin/vite.js');
const runtimeDir = resolve(root, 'server-dist');

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (signal) rejectRun(new Error(`Process terminated by ${signal}`));
      else if (code === 0) resolveRun();
      else rejectRun(new Error(`Process exited with code ${code ?? 'unknown'}`));
    });
  });
}

await run(node, [tsc, '-p', 'tsconfig.server-runtime.json']);
await mkdir(runtimeDir, { recursive: true });
await writeFile(resolve(runtimeDir, 'package.json'), '{"type":"commonjs"}\n', 'utf8');

const api = spawn(node, ['--experimental-sqlite', resolve(runtimeDir, 'server/runtime/server.js')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
const web = spawn(node, [vite, '--host', '0.0.0.0', '--port', '3000'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  process.exitCode = exitCode;
}

api.once('exit', (code) => {
  if (!stopping) stop(code === 0 ? 0 : 1);
});
web.once('exit', (code) => {
  if (!stopping) stop(code === 0 ? 0 : 1);
});
api.once('error', () => stop(1));
web.once('error', () => stop(1));
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
