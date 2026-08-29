import { randomBytes, scrypt as _scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

/** Promise wrapper around crypto.scrypt that accepts an options object. */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

const KEYLEN = 64;
const COST = 2 ** 15; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
// scrypt with N=2^15 needs ~32 MiB; the default maxmem (32 MiB) is too tight.
const MAXMEM = 64 * 1024 * 1024;

/**
 * Hash a password with scrypt (Node built-in — no native build step, so it
 * works identically in the seed script, on Vercel functions and in tests).
 * Format: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: MAXMEM,
  });
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Constant-time verification of a password against a stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64!, 'base64');
  const expected = Buffer.from(hashB64!, 'base64');
  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
