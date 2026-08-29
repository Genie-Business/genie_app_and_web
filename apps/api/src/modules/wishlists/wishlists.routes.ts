import { createRoute } from '@hono/zod-openapi';
import { events as E } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth } from '../../middleware/auth';
import * as service from './wishlists.service';

const router = createRouter();

router.use('*', requireAuth);

const wishlistResponse = z.object({ data: z.record(z.unknown()) });

// ── POST /wishlists ───────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Wishlists'],
    summary: 'Create a wishlist for an event',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(E.createWishlistBody) },
    responses: { 201: jsonResponse('Wishlist created', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const data = await service.createWishlist(c.get('user')!.id, c.req.valid('json'));
    return c.json(serializeBigInts({ data }), 201);
  },
);

// ── GET /wishlists/{id} ───────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Wishlists'],
    summary: 'Get a wishlist with its items',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Wishlist', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const data = await service.getWishlist(c.get('user')!.id, c.req.valid('param').id);
    return c.json(serializeBigInts({ data }), 200);
  },
);

// ── GET /wishlists/{id}/share ────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/share',
    tags: ['Wishlists'],
    summary: 'Get a shareable link (needs ≥ 2 items)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Share info', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const data = await service.shareInfo(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data }, 200);
  },
);

// ── POST /wishlists/{id}/items ───────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/items',
    tags: ['Wishlists'],
    summary: 'Add / update a product on a wishlist',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(E.addWishlistItemBody) },
    responses: { 200: jsonResponse('Updated wishlist', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const data = await service.addItem(
      c.get('user')!.id,
      c.req.valid('param').id,
      c.req.valid('json'),
    );
    return c.json(serializeBigInts({ data }), 200);
  },
);

// ── PATCH /wishlists/{id}/items/{itemId} ─────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}/items/{itemId}',
    tags: ['Wishlists'],
    summary: 'Update quantity / note for a wishlist item',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ id: z.string(), itemId: z.string() }),
      body: jsonBody(E.updateWishlistItemBody),
    },
    responses: { 200: jsonResponse('Updated wishlist', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const { id, itemId } = c.req.valid('param');
    const data = await service.updateItem(c.get('user')!.id, id, itemId, c.req.valid('json'));
    return c.json(serializeBigInts({ data }), 200);
  },
);

// ── DELETE /wishlists/{id}/items/{itemId} ────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}/items/{itemId}',
    tags: ['Wishlists'],
    summary: 'Remove an item from a wishlist',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string(), itemId: z.string() }) },
    responses: { 200: jsonResponse('Updated wishlist', wishlistResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const { id, itemId } = c.req.valid('param');
    const data = await service.removeItem(c.get('user')!.id, id, itemId);
    return c.json(serializeBigInts({ data }), 200);
  },
);

export default router;
