import { createRoute } from '@hono/zod-openapi';
import { gifts as G } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import * as service from './gifts.service';

const router = createRouter();

router.use('*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())) });

// ── POST /gifts/quote ──────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/quote',
    tags: ['Gifts'],
    summary: 'Fee breakdown for gifting a wishlist item (before paying)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.giftQuoteBody) },
    responses: { 200: jsonResponse('Charge breakdown', dataObj), ...commonErrorResponses },
  }),
  async (c) => {
    const b = c.req.valid('json');
    return c.json(serializeBigInts({ data: await service.quote(b.wishlistItemId, b.quantity) }), 200);
  },
);

// ── POST /gifts ────────────────────────────────────────────────────────
router.use('/', requireVerifiedEmail);
router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Gifts'],
    summary: 'Pay for a wishlist gift — wallet or bank transfer (US0016/US0019)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(G.payForGiftBody) },
    responses: {
      201: jsonResponse('Gift paid (wallet) or a virtual account to pay into', dataObj),
      409: jsonResponse('Insufficient funds / out of stock / over-fulfilled', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const res = await service.payForGift(c.get('user')!.id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: res }), 201);
  },
);

// ── GET /gifts  (given) ────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Gifts'],
    summary: 'Gifts I have given',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Gifts given', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await service.listGiven(c.get('user')!.id) }), 200),
);

// ── GET /gifts/received ────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/received',
    tags: ['Gifts'],
    summary: 'Gifts on my events (anonymous ones hidden until revealed)',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Gifts received', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await service.listReceived(c.get('user')!.id) }), 200),
);

// ── GET /gifts/invitations ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/invitations',
    tags: ['Gifts'],
    summary: "Friends' wishlists I can still gift from (home feed)",
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Invitations', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await service.listInvitations(c.get('user')!.id) }), 200),
);

// ── POST /gifts/{id}/reveal ────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/reveal',
    tags: ['Gifts'],
    summary: 'Reveal an anonymous gift once it physically arrives (E005)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Revealed', dataObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await service.reveal(c.get('user')!.id, c.req.valid('param').id) }, 200),
);

export default router;
