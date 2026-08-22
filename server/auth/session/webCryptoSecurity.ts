import type { SessionSecurityPort } from './contracts';

const encoder = new TextEncoder();
const MIN_PEPPER_BYTES = 32;

type CryptoBytes = Uint8Array<ArrayBuffer>;

function copyToCryptoBytes(source: Uint8Array): CryptoBytes {
  const copy = new Uint8Array(new ArrayBuffer(source.byteLength));
  copy.set(source);
  return copy;
}

function randomBytes(length: number): CryptoBytes {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const value of bytes) output += value.toString(16).padStart(2, '0');
  return output;
}

function fromHex(value: string): CryptoBytes | null {
  if (!value || value.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(value)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    const pair = value.slice(index * 2, index * 2 + 2);
    const parsed = Number.parseInt(pair, 16);
    if (!Number.isFinite(parsed)) return null;
    bytes[index] = parsed;
  }
  return bytes;
}

function sessionPayload(sessionId: string, secret: string): CryptoBytes {
  return copyToCryptoBytes(encoder.encode(`session:v1\0${sessionId}\0${secret}`));
}

/**
 * Zero-dependency server-session crypto primitive.
 * The pepper must come from protected server configuration and must be
 * independent from frontend/browser state.
 */
export class WebCryptoSessionSecurity implements SessionSecurityPort {
  private readonly keyPromise: Promise<CryptoKey>;

  constructor(pepper: Uint8Array) {
    if (!globalThis.crypto?.subtle || pepper.byteLength < MIN_PEPPER_BYTES) {
      throw new Error('Session security requires Web Crypto and a >=32 byte pepper');
    }
    this.keyPromise = this.importPepper(copyToCryptoBytes(pepper));
  }

  private async importPepper(keyMaterial: CryptoBytes): Promise<CryptoKey> {
    try {
      return await globalThis.crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      );
    } finally {
      keyMaterial.fill(0);
    }
  }

  generateSessionId(): string {
    return toHex(randomBytes(16));
  }

  generateSessionSecret(): string {
    return toHex(randomBytes(32));
  }

  async macSessionSecret(input: { sessionId: string; secret: string }): Promise<string> {
    const key = await this.keyPromise;
    const payload = sessionPayload(input.sessionId, input.secret);
    try {
      const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
      return toHex(new Uint8Array(signature));
    } finally {
      payload.fill(0);
    }
  }

  async verifySessionSecret(input: {
    sessionId: string;
    secret: string;
    expectedMac: string;
  }): Promise<boolean> {
    const signature = fromHex(input.expectedMac);
    if (!signature) return false;

    const key = await this.keyPromise;
    const payload = sessionPayload(input.sessionId, input.secret);
    try {
      return await globalThis.crypto.subtle.verify('HMAC', key, signature, payload);
    } finally {
      payload.fill(0);
      signature.fill(0);
    }
  }
}
