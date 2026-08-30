import { createRoute } from '@hono/zod-openapi';
import { carts as C } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { addItem, checkout, clearCart, getCart, removeItem, updateItem } from './cart.service';

const router = createRouter();

router.use('*', requireAuth);
router.use('/checkout', requireVerifiedEmail);

const cartObj = z.object({ data: z.record(z.unknown()) });

// ── GET /cart ─────────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Cart'],
    summary: 'My open cart (a gift basket of wishlist items)',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Cart', cartObj), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await getCart(c.get('user')!.id) }), 200),
);

// ── POST /cart/items ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/items',
    tags: ['Cart'],
    summary: 'Add or set a wishlist item in the cart',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.addCartItemBody) },
    responses: { 200: jsonResponse('Updated cart', cartObj), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await addItem(c.get('user')!.id, c.req.valid('json')) }), 200),
);

// ── PATCH /cart/items/{itemId} ───────────────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/items/{itemId}',
    tags: ['Cart'],
    summary: 'Update a cart line (quantity / anonymous / message)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ itemId: z.string() }), body: jsonBody(C.updateCartItemBody) },
    responses: { 200: jsonResponse('Updated cart', cartObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json(
      serializeBigInts({ data: await updateItem(c.get('user')!.id, c.req.valid('param').itemId, c.req.valid('json')) }),
      200,
    ),
);

// ── DELETE /cart/items/{itemId} ──────────────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/items/{itemId}',
    tags: ['Cart'],
    summary: 'Remove a cart line',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ itemId: z.string() }) },
    responses: { 200: jsonResponse('Updated cart', cartObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json(serializeBigInts({ data: await removeItem(c.get('user')!.id, c.req.valid('param').itemId) }), 200),
);

// ── DELETE /cart ─────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/',
    tags: ['Cart'],
    summary: 'Empty the cart',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Empty cart', cartObj), ...commonErrorResponses },
  }),
  async (c) => c.json(serializeBigInts({ data: await clearCart(c.get('user')!.id) }), 200),
);

// ── POST /cart/checkout ──────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/checkout',
    tags: ['Cart'],
    summary: 'Pay for every giftable item in the cart at once',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.checkoutCartBody) },
    responses: {
      201: jsonResponse('Paid (wallet) or a virtual account to pay into', cartObj),
      409: jsonResponse('Insufficient funds / item not giftable', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) =>
    c.json(serializeBigInts({ data: await checkout(c.get('user')!.id, c.req.valid('json').method) }), 201),
);

export default router;
