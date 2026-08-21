import type { EmailOtpRateLimitScope, EmailOtpSecurityPort } from './contracts';

const encoder = new TextEncoder();
const UINT32_RANGE = 0x1_0000_0000;
const MIN_PEPPER_BYTES = 32;

type CryptoBytes = Uint8Array<ArrayBuffer>;

function copyToCryptoBytes(source: Uint8Array): CryptoBytes {
  const copy = new Uint8Array(new ArrayBuffer(source.byteLength));
  copy.set(source);
  return copy;
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

function randomBytes(length: number): CryptoBytes {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomInteger(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new Error('Invalid random range');
  }

  const cutoff = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const buffer = new Uint32Array(new ArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));

  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value !== undefined && value < cutoff) return value % maxExclusive;
  }
}

function otpPayload(input: { challengeId: string; email: string; code: string }): CryptoBytes {
  return copyToCryptoBytes(encoder.encode(`otp:v1\0${input.challengeId}\0${input.email}\0${input.code}`));
}

/**
 * Production-compatible zero-dependency security primitive for the Email OTP
 * core. The caller must inject a high-entropy pepper from protected server
 * environment/configuration. Never hard-code or send the pepper to clients.
 */
export class WebCryptoEmailOtpSecurity implements EmailOtpSecurityPort {
  private readonly keyPromise: Promise<CryptoKey>;

  constructor(pepper: Uint8Array) {
    if (!globalThis.crypto?.subtle || pepper.byteLength < MIN_PEPPER_BYTES) {
      throw new Error('Email OTP security requires Web Crypto and a >=32 byte pepper');
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

  generateChallengeId(): string {
    return toHex(randomBytes(16));
  }

  generateCode(digits: number): string {
    if (!Number.isInteger(digits) || digits < 4 || digits > 9) {
      throw new Error('Email OTP code length must be between 4 and 9 digits');
    }

    const range = 10 ** digits;
    return randomInteger(range).toString().padStart(digits, '0');
  }

  async macCode(input: { challengeId: string; email: string; code: string }): Promise<string> {
    const key = await this.keyPromise;
    const payload = otpPayload(input);
    try {
      const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
      return toHex(new Uint8Array(signature));
    } finally {
      payload.fill(0);
    }
  }

  async verifyCodeMac(input: {
    challengeId: string;
    email: string;
    code: string;
    expectedMac: string;
  }): Promise<boolean> {
    const signature = fromHex(input.expectedMac);
    if (!signature) return false;

    const key = await this.keyPromise;
    const payload = otpPayload(input);
    try {
      return await globalThis.crypto.subtle.verify('HMAC', key, signature, payload);
    } finally {
      payload.fill(0);
      signature.fill(0);
    }
  }

  async derivePrivacyKey(scope: EmailOtpRateLimitScope, value: string): Promise<string> {
    const key = await this.keyPromise;
    const payload = copyToCryptoBytes(encoder.encode(`rate:v1\0${scope}\0${value}`));
    try {
      const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
      return toHex(new Uint8Array(signature));
    } finally {
      payload.fill(0);
    }
  }
}
