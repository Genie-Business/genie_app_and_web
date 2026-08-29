import { tooManyRequests } from './errors';

/**
 * A minimal fixed-window in-memory rate limiter. Good enough for a single
 * always-on dev server and low-traffic preview deploys. On Vercel each function
 * instance keeps its own map, so this is best-effort only — swap for Upstash
 * Redis (or Vercel KV) before relying on it in production. Tracked in the plan.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitRule = { limit: number; windowMs: number };

export function rateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > rule.limit) {
    const secs = Math.ceil((existing.resetAt - now) / 1000);
    throw tooManyRequests(`Too many attempts. Try again in ${secs}s.`);
  }
}

// Periodic cleanup so the map doesn't grow unbounded on a long-lived process.
if (typeof setInterval === 'function') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000);
  if (typeof timer.unref === 'function') timer.unref();
}

export const RULES = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  otpRequest: { limit: 4, windowMs: 15 * 60_000 },
  otpVerify: { limit: 10, windowMs: 15 * 60_000 },
  passwordReset: { limit: 4, windowMs: 30 * 60_000 },
} satisfies Record<string, RateLimitRule>;
