import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { createRouter } from '../../lib/router';
import { getEnv } from '../../env';
import { AppError, unauthorized } from '../../lib/errors';
import { runPayouts } from './payouts.service';

/**
 * Machine-to-machine endpoints, not part of the public API. The scheduled payout run
 * (Vercel Cron sends a GET with `Authorization: Bearer $CRON_SECRET`) and the admin
 * portal's "run payouts now" button both land here.
 */
const router = createRouter();

const digest = (s: string) => createHash('sha256').update(s).digest();

async function run(c: Context) {
  const secret = getEnv().CRON_SECRET;
  // Without a secret there is no way to tell the scheduler from anyone else: stay shut.
  if (!secret) throw new AppError(503, 'not_configured', 'Scheduled payouts are not configured (set CRON_SECRET).');

  const header = c.req.header('authorization') ?? '';
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  // Compare fixed-length digests so the check takes the same time whatever was sent.
  if (!timingSafeEqual(digest(given), digest(secret))) throw unauthorized('Invalid credentials.');

  return c.json({ data: await runPayouts() }, 200);
}

router.get('/run', run);
router.post('/run', run);

export default router;
