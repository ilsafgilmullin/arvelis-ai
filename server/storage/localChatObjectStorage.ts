import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type {
  ChatObjectReadResult,
  ChatObjectStorage,
  ChatObjectWriteResult,
} from '../chat/attachments/contracts';

const DATA_ROOT = resolve('.data');
const STORAGE_KEY_PATTERN = /^[a-f0-9]{2}\/[a-f0-9]{32}$/;

function safeRoot(root: string): string {
  const resolved = resolve(root);
  const rel = relative(DATA_ROOT, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('CHAT_FILE_ROOT must point to a directory inside .data/');
  }
  return resolved;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

export function storageKeyForUpload(uploadId: string): string {
  if (!/^[a-f0-9]{32}$/.test(uploadId)) throw new Error('Invalid upload id for storage key');
  return `${uploadId.slice(0, 2)}/${uploadId}`;
}

export class LocalChatObjectStorage implements ChatObjectStorage {
  private readonly root: string;

  constructor(root = '.data/chat-files') {
    this.root = safeRoot(root);
  }

  private resolveKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error('Invalid Chat storage key');
    const target = resolve(this.root, storageKey);
    const rel = relative(this.root, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error('Unsafe Chat storage key');
    }
    return target;
  }

  async write(input: {
    storageKey: string;
    source: AsyncIterable<Uint8Array>;
    expectedBytes: number;
    maxBytes: number;
    headBytes: number;
  }): Promise<ChatObjectWriteResult> {
    if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0) throw new Error('Invalid expected upload size');
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < input.expectedBytes) throw new Error('Invalid upload maximum');
    if (!Number.isInteger(input.headBytes) || input.headBytes < 1 || input.headBytes > 4096) throw new Error('Invalid upload head size');

    const target = this.resolveKey(input.storageKey);
    const temporary = `${target}.tmp`;
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await unlinkIfPresent(temporary);

    const handle = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    const headChunks: Uint8Array[] = [];
    let headLength = 0;
    let total = 0;
    let completed = false;

    try {
      for await (const rawChunk of input.source) {
        const chunk = rawChunk instanceof Uint8Array ? rawChunk : new Uint8Array(rawChunk);
        if (!chunk.byteLength) continue;
        total += chunk.byteLength;
        if (total > input.maxBytes || total > input.expectedBytes) throw new Error('Upload exceeds declared size');

        hash.update(chunk);
        if (headLength < input.headBytes) {
          const remaining = input.headBytes - headLength;
          const slice = chunk.subarray(0, Math.min(remaining, chunk.byteLength));
          headChunks.push(slice.slice());
          headLength += slice.byteLength;
        }
        await handle.write(chunk);
      }

      if (total !== input.expectedBytes) throw new Error('Upload size does not match Content-Length');
      await handle.sync();
      await handle.close();
      await rename(temporary, target);
      completed = true;

      const head = new Uint8Array(headLength);
      let offset = 0;
      for (const chunk of headChunks) {
        head.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return {
        sizeBytes: total,
        sha256: hash.digest('hex'),
        head,
      };
    } finally {
      if (!completed) {
        try { await handle.close(); } catch { /* already closed */ }
        await unlinkIfPresent(temporary);
      }
    }
  }

  async read(storageKey: string, range?: { start: number; endInclusive: number }): Promise<ChatObjectReadResult | null> {
    const target = this.resolveKey(storageKey);
    let info;
    try {
      info = await stat(target);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    if (!info.isFile()) return null;
    const sizeBytes = Number(info.size);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error('Invalid stored object size');

    if (range) {
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.endInclusive)
        || range.start < 0 || range.endInclusive < range.start || range.endInclusive >= sizeBytes) {
        throw new Error('Invalid object range');
      }
      return {
        stream: createReadStream(target, { start: range.start, end: range.endInclusive }),
        sizeBytes: range.endInclusive - range.start + 1,
      };
    }

    return { stream: createReadStream(target), sizeBytes };
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.resolveKey(storageKey);
    await unlinkIfPresent(target);
    await unlinkIfPresent(`${target}.tmp`);
  }
}
