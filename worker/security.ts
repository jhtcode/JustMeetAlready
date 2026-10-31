/**
 * WebCrypto security helpers for Cloudflare Workers.
 *
 * Workers have no Node `crypto.scrypt`. Passwords therefore use PBKDF2-SHA-256
 * via SubtleCrypto, which is native code in the isolate (not a JS loop), so it
 * stays well inside the free plan's 10 ms CPU-per-invocation budget for the
 * small number of sign-ins this app does. The stored format is distinct from
 * the old Node build's `scrypt$...` format on purpose: old hashes are not
 * verified here, and no old events are migrated anyway (the old deployment's
 * data lived on an ephemeral disk and is already gone).
 *
 * Stored format: `pbkdf2$<saltHex>$<keyHex>$<iterations>`
 */

const ITERATIONS = 60000;
const KEY_BYTES = 32;

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${hex(salt)}$${hex(key)}$${ITERATIONS}`;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: string | undefined
): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, keyHex, iterStr] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !keyHex) return false;
  const iterations = Number(iterStr) || ITERATIONS;
  const expected = unhex(keyHex);
  if (expected.length === 0) return false;
  const actual = await pbkdf2(password, unhex(saltHex), iterations);
  return constantTimeEqual(expected, actual);
}

/** Random bearer token handed to the client at sign-in. Only its hash is stored. */
export function newSessionToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(digest);
}

/** Random 96-bit event id, same shape as the hardened Node build. */
export function newEventId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(12)));
}
