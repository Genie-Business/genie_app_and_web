import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Generate a numeric OTP of the given length (default 6). */
export function generateOtp(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += randomInt(0, 10).toString();
  return out;
}

/**
 * Hash an OTP for storage. OTPs are low-entropy and short-lived, so a fast
 * SHA-256 with a server pepper is appropriate (rate-limiting + attempt caps do
 * the real work). Pass `process.env.OTP_PEPPER` (or JWT secret) as the pepper.
 */
export function hashOtp(code: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${code}`).digest('hex');
}

export function verifyOtp(code: string, storedHash: string, pepper: string): boolean {
  const candidate = Buffer.from(hashOtp(code, pepper), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
