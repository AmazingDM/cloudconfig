import { sha256Hex } from './hash';

const encoder = new TextEncoder();

const apiKeyHashScheme = 'pbkdf2-sha256';
const apiKeyHashIterations = 210_000;
const apiKeyHashBytes = 32;
const apiKeySaltBytes = 16;
const legacySha256HexPattern = /^[a-f0-9]{64}$/i;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

function createSalt(): Uint8Array {
  const salt = new Uint8Array(apiKeySaltBytes);
  crypto.getRandomValues(salt);
  return salt;
}

async function derivePbkdf2Sha256(apiKey: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const normalizedSalt = new Uint8Array(salt.byteLength);
  normalizedSalt.set(salt);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: normalizedSalt,
      iterations
    },
    key,
    apiKeyHashBytes * 8
  );

  return new Uint8Array(bits);
}

export async function createApiKeyHash(apiKey: string): Promise<string> {
  const salt = createSalt();
  const derived = await derivePbkdf2Sha256(apiKey, salt, apiKeyHashIterations);

  return `${apiKeyHashScheme}$${apiKeyHashIterations}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

export async function verifyApiKeyHash(apiKey: string, storedHash: string): Promise<boolean> {
  if (legacySha256HexPattern.test(storedHash)) {
    const actual = await sha256Hex(apiKey);
    return constantTimeEqual(
      hexToBytes(actual) ?? new Uint8Array(),
      hexToBytes(storedHash.toLowerCase()) ?? new Uint8Array()
    );
  }

  const [scheme, iterationsText, saltHex, derivedHex, extra] = storedHash.split('$');
  if (scheme !== apiKeyHashScheme || extra !== undefined || !iterationsText || !saltHex || !derivedHex) {
    return false;
  }

  const iterations = Number.parseInt(iterationsText, 10);
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(derivedHex);
  if (!Number.isSafeInteger(iterations) || iterations < apiKeyHashIterations || !salt || !expected) {
    return false;
  }

  const actual = await derivePbkdf2Sha256(apiKey, salt, iterations);
  return constantTimeEqual(actual, expected);
}
