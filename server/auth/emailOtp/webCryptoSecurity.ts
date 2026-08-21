import type { EmailOtpRateLimitScope, EmailOtpSecurityPort } from './contracts';

const encoder = new TextEncoder();
const UINT32_RANGE = 0x1_0000_0000;
const MIN_PEPPER_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const value of bytes) output += value.toString(16).padStart(2, '0');
  return output;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function randomInteger(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
    throw new Error('Invalid random range');
  }

  const cutoff = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const buffer = new Uint32Array(1);

  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value !== undefined && value < cutoff) return value % maxExclusive;
  }
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

    this.keyPromise = this.importPepper(new Uint8Array(pepper));
  }

  private async importPepper(keyMaterial: Uint8Array): Promise<CryptoKey> {
    try {
      return await globalThis.crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
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
    const payload = encoder.encode(`otp:v1\0${input.challengeId}\0${input.email}\0${input.code}`);
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
    payload.fill(0);
    return toHex(new Uint8Array(signature));
  }

  async derivePrivacyKey(scope: EmailOtpRateLimitScope, value: string): Promise<string> {
    const key = await this.keyPromise;
    const payload = encoder.encode(`rate:v1\0${scope}\0${value}`);
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, payload);
    payload.fill(0);
    return toHex(new Uint8Array(signature));
  }

  equalsMac(left: string, right: string): boolean {
    if (left.length !== right.length || left.length === 0) return false;

    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) {
      mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return mismatch === 0;
  }
}
