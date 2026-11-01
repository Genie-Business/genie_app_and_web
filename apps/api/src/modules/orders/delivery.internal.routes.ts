import { createHash, timingSafeEqual } from 'node:crypto';
import { createRouter } from '../../lib/router';
import { getEnv } from '../../env';
import { AppError, badRequest, unauthorized } from '../../lib/errors';
import { z } from '../../lib/openapi';
import { confirmByOrderNumber } from './delivery.service';

/**
 * Where a delivery is reported from outside the app. Not part of the public API:
 *  - the delivery company presents COURIER_API_KEY;
 *  - the admin portal (a fallback when the courier reports by phone or email) presents CRON_SECRET.
 * Either way the merchant's payment is released straight away.
 */
const router = createRouter();

const digest = (s: string) => createHash('sha256').update(s).digest();
const matches = (given: string, secret: string) => !!secret && timingSafeEqual(digest(given), digest(secret));

const body = z.object({ orderNumber: z.string().trim().min(3).max(60) });

router.post('/confirm', async (c) => {
  const env = getEnv();
  if (!env.COURIER_API_KEY && !env.CRON_SECRET) {
    throw new AppError(503, 'not_configured', 'Delivery confirmation is not configured (set COURIER_API_KEY).');
  }
  const header = c.req.header('authorization') ?? '';
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const by = matches(given, env.COURIER_API_KEY) ? 'courier' : matches(given, env.CRON_SECRET) ? 'admin' : null;
  if (!by) throw unauthorized('Invalid credentials.');

  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('Send {"orderNumber": "ORD-..."}.');
  return c.json({ data: await confirmByOrderNumber(parsed.data.orderNumber, by) }, 200);
});

export default router;
