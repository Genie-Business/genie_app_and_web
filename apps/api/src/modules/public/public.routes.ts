import { createRoute } from '@hono/zod-openapi';
import { events as E } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { rateLimit } from '../../lib/rate-limit';
import { getEnv } from '../../env';
import { badRequest } from '../../lib/errors';
import * as wishlists from '../wishlists/wishlists.service';
import * as gifts from '../gifts/gifts.service';
import { settleGiftTransfer } from '../gifts/gifts.service';
import { prisma } from '@genie/db';

/** Unauthenticated endpoints — mounted at /v1/public. */
const router = createRouter();

const clientIp = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header('x-vercel-forwarded-for')?.trim() ??
  c.req.header('x-real-ip')?.trim() ??
  'local';

router.openapi(
  createRoute({
    method: 'get',
    path: '/wishlists/{id}',
    tags: ['Public'],
    summary: 'View a shared wishlist (no auth) — for friends following a link',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Public wishlist', z.object({ data: z.record(z.unknown()) })),
      404: jsonResponse('Not available', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const view = await wishlists.publicView(c.req.valid('param').id);
    return c.json(serializeBigInts({ data: view }), 200);
  },
);

// ── POST /public/wishlists/{id}/checkout — guest buys one or more items ──
router.openapi(
  createRoute({
    method: 'post',
    path: '/wishlists/{id}/checkout',
    tags: ['Public'],
    summary: 'Pay for wishlist items as a guest (bank transfer, no account)',
    request: { params: z.object({ id: z.string() }), body: jsonBody(E.guestCheckoutBody) },
    responses: {
      201: jsonResponse('Transfer instructions', z.object({ data: E.guestCheckoutResultDto })),
      409: jsonResponse('Item unavailable', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await rateLimit(`guest-checkout:${clientIp(c)}`, { limit: 10, windowMs: 60 * 60_000 });
    const res = await gifts.guestCheckout(c.req.valid('param').id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: res }), 201);
  },
);

// ── GET /public/payments/{reference} — poll a guest checkout ────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/payments/{reference}',
    tags: ['Public'],
    summary: 'Guest checkout payment status',
    request: { params: z.object({ reference: z.string() }) },
    responses: {
      200: jsonResponse('Status', z.object({ data: z.record(z.unknown()) })),
      404: jsonResponse('Not found', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const res = await gifts.guestPaymentStatus(c.req.valid('param').reference);
    return c.json(serializeBigInts({ data: res }), 200);
  },
);

// ── POST /public/payments/{reference}/_simulate — non-prod testing aid ──
// Mirrors the wallet flow's _mock/settle: pretends the bank transfer landed.
router.post('/payments/:reference/_simulate', async (c) => {
  if (getEnv().APP_ENV === 'production') throw badRequest('Not available.');
  const reference = c.req.param('reference');
  const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
  if (!intent) throw badRequest('Unknown reference.');
  await settleGiftTransfer(reference, intent.amountKobo);
  return c.json({ data: { simulated: true, reference } }, 200);
});

export default router;
