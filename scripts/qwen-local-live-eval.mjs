import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat, statfs } from 'node:fs/promises';
import { createServer } from 'node:net';
import { availableParallelism, arch, freemem, platform, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const manifestPath = resolve('config/qwen-local-live-model-manifest.v1.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const mode = process.argv.includes('--run') ? 'run' : process.argv.includes('--preflight') ? 'preflight' : null;

if (!mode) {
  console.error('Usage: npm run eval:qwen-local-live -- --preflight | --run');
  process.exit(2);
}

const GiB = 1024 ** 3;
const host = process.env.QWEN_LOCAL_HOST ?? manifest.evaluation.loopbackHost;
const port = Number(process.env.QWEN_LOCAL_PORT ?? manifest.evaluation.defaultPort);
const baseUrl = `http://${host}:${port}/v1`;
const modelDir = resolve(process.env.QWEN_LOCAL_MODEL_DIR ?? '.local-models/qwen3-8b');
const modelPath = resolve(process.env.QWEN_LOCAL_MODEL_PATH ?? resolve(modelDir, manifest.model.filename));
const outputDir = resolve(process.env.QWEN_LOCAL_EVAL_OUTPUT_DIR ?? '.local-eval/qwen');
const llamaServer = process.env.LLAMA_CPP_SERVER ?? 'llama-server';
const errors = [];
const notes = [];

function safeNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatGiB(bytes) {
  return Math.round((bytes / GiB) * 100) / 100;
}

function validateEndpoint() {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) errors.push(`host_not_loopback:${host}`);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) errors.push(`invalid_port:${port}`);
}

function versionCheck() {
  const result = spawnSync(llamaServer, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (result.error?.code === 'ENOENT') {
    errors.push(`llama_server_not_found:${llamaServer}`);
    return '';
  }
  if (result.error) {
    errors.push(`llama_server_version_failed:${result.error.message}`);
    return '';
  }
  const observed = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().replace(/\s+/g, ' ').slice(0, 500);
  const expectedCommitPrefix = manifest.llamaCpp.commit.slice(0, 7);
  const releaseNumber = manifest.llamaCpp.release.replace(/^b/, '');
  if (!observed.includes(expectedCommitPrefix)) {
    errors.push(`llama_cpp_version_mismatch:expected_commit=${expectedCommitPrefix};observed=${observed || '<empty>'}`);
  } else if (!observed.includes(releaseNumber)) {
    notes.push(`llama_cpp_release_label_not_reported:${manifest.llamaCpp.release}`);
  }
  return observed;
}

async function diskCheck() {
  let probe = modelDir;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const filesystem = await statfs(probe, { bigint: true });
  const free = Number(filesystem.bavail * filesystem.bsize);
  if (free < manifest.evaluation.minimumFreeDiskBytes) {
    errors.push(`insufficient_free_disk:${free}`);
  }
  return free;
}

function ramCheck() {
  const total = totalmem();
  const available = freemem();
  if (total < manifest.evaluation.minimumTotalRamBytes) errors.push(`insufficient_total_ram:${total}`);
  if (available < manifest.evaluation.minimumAvailableRamBytes) errors.push(`insufficient_available_ram:${available}`);
  return { total, available };
}

async function portIsFree() {
  return await new Promise((resolvePromise) => {
    const server = createServer();
    server.once('error', () => resolvePromise(false));
    server.listen({ host: host === 'localhost' ? '127.0.0.1' : host, port, exclusive: true }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

function listenerSnapshot() {
  const commands = platform() === 'win32'
    ? [['netstat', ['-ano']]]
    : [['ss', ['-ltn']], ['lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']]];
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000 });
    if (!result.error && result.status === 0) return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  }
  return null;
}

function verifyLoopbackListener(snapshot) {
  if (snapshot === null) {
    errors.push('cannot_verify_listener_exposure');
    return;
  }
  const portPattern = String(port);
  const relevant = snapshot.split(/\r?\n/).filter((line) => line.includes(portPattern));
  if (relevant.length === 0) {
    errors.push(`llama_listener_not_found:${port}`);
    return;
  }
  const publicPattern = new RegExp(`(?:0\\.0\\.0\\.0|\\[?:::\\]?|\\*):${port}(?:\\s|$)`);
  if (relevant.some((line) => publicPattern.test(line))) errors.push(`llama_listener_publicly_exposed:${port}`);
  const loopbackSeen = relevant.some((line) => line.includes(`127.0.0.1:${port}`) || line.includes(`[::1]:${port}`) || line.includes(`::1:${port}`));
  if (!loopbackSeen) errors.push(`llama_listener_not_confirmed_loopback:${port}`);
}

async function sha256File(path) {
  return await new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function artifactCheck() {
  if (!existsSync(modelPath)) {
    errors.push(`model_file_missing:${modelPath}`);
    return null;
  }
  const metadata = await stat(modelPath);
  if (metadata.size !== manifest.model.sizeBytes) errors.push(`model_size_mismatch:expected=${manifest.model.sizeBytes};actual=${metadata.size}`);
  const sha256 = await sha256File(modelPath);
  if (sha256 !== manifest.model.sha256) errors.push(`model_sha256_mismatch:expected=${manifest.model.sha256};actual=${sha256}`);
  return { size: metadata.size, sha256 };
}

async function endpointCheck() {
  const healthUrl = new URL('/health', baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const health = await fetch(healthUrl, { signal: controller.signal, redirect: 'error' });
    if (!health.ok) errors.push(`llama_health_failed:${health.status}`);
    const models = await fetch(new URL('models', baseUrl), { signal: controller.signal, redirect: 'error' });
    if (!models.ok) {
      errors.push(`llama_models_failed:${models.status}`);
      return;
    }
    const body = await models.json();
    const ids = Array.isArray(body?.data) ? body.data.map((item) => item?.id).filter((item) => typeof item === 'string') : [];
    if (!ids.includes(manifest.model.runtimeModelId)) {
      errors.push(`runtime_model_alias_missing:${manifest.model.runtimeModelId}`);
    }
  } catch (error) {
    errors.push(`llama_endpoint_unavailable:${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function compileLiveRunner() {
  const tsc = resolve('node_modules/typescript/bin/tsc');
  if (!existsSync(tsc)) {
    errors.push('typescript_not_installed_run_npm_ci_first');
    return false;
  }
  const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.qwen-local-live-eval.json'], {
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.status !== 0) {
    errors.push(`live_eval_compile_failed:${result.status ?? 'unknown'}`);
    return false;
  }
  return true;
}

validateEndpoint();
const observedVersion = versionCheck();
const freeDisk = await diskCheck();
const memory = ramCheck();
const freePort = await portIsFree();

if (mode === 'preflight') {
  if (!freePort) errors.push(`local_port_not_free:${port}`);
  notes.push('Preflight never installs llama.cpp, downloads GGUF, starts a model, or provisions infrastructure.');
} else {
  if (freePort) errors.push(`llama_server_not_running_on_port:${port}`);
  verifyLoopbackListener(listenerSnapshot());
  await artifactCheck();
  await endpointCheck();
}

const summary = {
  mode,
  os: platform(),
  arch: arch(),
  logicalCpuParallelism: availableParallelism(),
  totalRamGiB: formatGiB(memory.total),
  availableRamGiB: formatGiB(memory.available),
  freeDiskGiB: formatGiB(freeDisk),
  llamaCppExpected: `${manifest.llamaCpp.release}/${manifest.llamaCpp.commit}`,
  llamaCppObserved: observedVersion || null,
  endpoint: baseUrl,
  modelPath,
  expectedModelBytes: manifest.model.sizeBytes,
  errors,
  notes,
};
console.log(JSON.stringify(summary, null, 2));

if (errors.length > 0) process.exit(1);
if (mode === 'preflight') process.exit(0);
if (!compileLiveRunner()) process.exit(1);

const runner = resolve('tests/.dist-qwen-local-live-eval/server/travel/qwenLocalLiveEvaluation.js');
const child = spawnSync(process.execPath, [runner], {
  stdio: 'inherit',
  env: {
    ...process.env,
    QWEN_LOCAL_BASE_URL: baseUrl,
    QWEN_LOCAL_MODEL_ID: manifest.model.runtimeModelId,
    QWEN_LOCAL_MODEL_REPO: manifest.model.repo,
    QWEN_LOCAL_MODEL_REVISION: manifest.model.revision,
    QWEN_LOCAL_MODEL_FILENAME: manifest.model.filename,
    QWEN_LOCAL_MODEL_SHA256: manifest.model.sha256,
    QWEN_LOCAL_QUANTIZATION: manifest.model.quantization,
    QWEN_LOCAL_CONTEXT_SIZE: String(manifest.evaluation.contextSize),
    QWEN_LOCAL_LLAMACPP_RELEASE: manifest.llamaCpp.release,
    QWEN_LOCAL_LLAMACPP_COMMIT: manifest.llamaCpp.commit,
    QWEN_LOCAL_LLAMACPP_VERSION_OBSERVED: observedVersion,
    QWEN_LOCAL_EVAL_OUTPUT_DIR: outputDir,
  },
});
process.exit(child.status ?? 1);
