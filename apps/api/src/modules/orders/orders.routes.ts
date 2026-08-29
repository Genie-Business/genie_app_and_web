import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth } from '../../middleware/auth';
import { getMyOrder, listMyOrders } from './orders.service';

const router = createRouter();

router.use('*', requireAuth);

// ── GET /orders ────────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Orders'],
    summary: 'Orders I placed (one per gift)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Orders', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json(serializeBigInts({ data: await listMyOrders(c.get('user')!.id) }), 200),
);

// ── GET /orders/{id} ──────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Orders'],
    summary: 'Order detail',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Order', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) =>
    c.json(serializeBigInts({ data: await getMyOrder(c.get('user')!.id, c.req.valid('param').id) }), 200),
);

export default router;
