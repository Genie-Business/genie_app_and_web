import { prisma } from '@genie/db';
import { tooManyRequests } from './errors';
import { logger } from './logger';

/**
 * Fixed-window rate limiting backed by a shared Postgres counter, so it holds
 * across the many short-lived function instances Vercel runs (an in-memory map
 * is per-instance and effectively no limit at all).
 *
 * Each check is a single atomic upsert. If the DB is briefly unreachable we
 * fall back to a per-instance in-memory window and log it — degraded, not open.
 */
export type RateLimitRule = { limit: number; windowMs: number };

type Row = { count: number; expiresAt: Date };

// ── In-memory fallback ────────────────────────────────────────────────
const mem = new Map<string, { count: number; resetAt: number }>();
function memHit(key: string, rule: RateLimitRule): number {
  const now = Date.now();
  const b = mem.get(key);
  if (!b || b.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + rule.windowMs });
    return 1;
  }
  b.count += 1;
  return b.count;
}
if (typeof setInterval === 'function') {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  }, 60_000);
  if (typeof t.unref === 'function') t.unref();
}

/** Test helper — clear all buckets. */
export async function __resetRateLimits(): Promise<void> {
  mem.clear();
  // Best-effort; ignored if the table/DB isn't there (pure-unit test runs).
  await prisma.$executeRaw`DELETE FROM "RateLimit"`.catch(() => undefined);
}

/**
 * Count one hit against `key`. Throws 429 once the window limit is exceeded.
 * `key` is namespaced by the caller (e.g. `login:1.2.3.4:alice`).
 */
export async function rateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const now = Date.now();
  const expires = new Date(now + rule.windowMs);
  let count: number;
  let resetAt = expires.getTime();

  try {
    const rows = await prisma.$queryRaw<Row[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expires})
      ON CONFLICT ("key") DO UPDATE SET
        "count"     = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN ${expires} ELSE "RateLimit"."expiresAt" END
      RETURNING "count", "expiresAt"
    `;
    count = rows[0]?.count ?? 1;
    resetAt = rows[0]?.expiresAt?.getTime() ?? resetAt;
  } catch (err) {
    logger.warn({ err, key }, 'rate-limit DB unavailable — using in-memory fallback');
    count = memHit(key, rule);
  }

  if (count > rule.limit) {
    const secs = Math.max(1, Math.ceil((resetAt - now) / 1000));
    throw tooManyRequests(`Too many attempts. Try again in ${secs}s.`);
  }
}

/** Opportunistic sweep of expired rows — call from a low-traffic path. */
export async function sweepRateLimits(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "expiresAt" <= now() - interval '1 hour'`.catch(
    () => undefined,
  );
}

export const RULES = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  loginIp: { limit: 40, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  otpRequest: { limit: 4, windowMs: 15 * 60_000 },
  otpVerify: { limit: 8, windowMs: 15 * 60_000 },
  passwordReset: { limit: 4, windowMs: 30 * 60_000 },
  adminLogin: { limit: 6, windowMs: 15 * 60_000 },
} satisfies Record<string, RateLimitRule>;
