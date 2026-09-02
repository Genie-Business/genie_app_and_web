import { prisma } from '@genie/db';

/**
 * Shared Postgres fixed-window limiter (same `RateLimit` table the API uses).
 * Returns true when the caller is over the limit and should be blocked.
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const expires = new Date(Date.now() + windowMs);
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expires})
      ON CONFLICT ("key") DO UPDATE SET
        "count"     = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN ${expires} ELSE "RateLimit"."expiresAt" END
      RETURNING "count"
    `;
    return (rows[0]?.count ?? 1) > limit;
  } catch {
    return false; // fail open only if the counter itself is unavailable
  }
}
