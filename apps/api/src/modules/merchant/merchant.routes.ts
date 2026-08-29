import { createRoute } from '@hono/zod-openapi';
import { catalog as C, orders as O } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireRole } from '../../middleware/auth';
import { toProductDto } from '../catalog/catalog.mapper';
import * as service from './merchant.service';

const router = createRouter();

router.use('*', requireAuth, requireRole('MERCHANT'));

const productResponse = z.object({ data: z.record(z.unknown()) });

// ── POST /merchant/products ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/products',
    tags: ['Merchant'],
    summary: 'Add a product / service (US0013)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.createProductBody) },
    responses: {
      201: jsonResponse('Product created', productResponse),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const product = await service.createProduct(user.id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: toProductDto(product) }), 201);
  },
);

// ── GET /merchant/products ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/products',
    tags: ['Merchant'],
    summary: 'List my products / services',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Products', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const items = await service.listProducts(user.id);
    return c.json(serializeBigInts({ data: items.map(toProductDto) }), 200);
  },
);

// ── PATCH /merchant/products/{id} ──────────────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/products/{id}',
    tags: ['Merchant'],
    summary: 'Edit a product / service',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(C.updateProductBody) },
    responses: { 200: jsonResponse('Updated product', productResponse), ...commonErrorResponses },
  }),
  async (c) => {
    const user = c.get('user')!;
    const { id } = c.req.valid('param');
    const product = await service.updateProduct(user.id, id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: toProductDto(product) }), 200);
  },
);

// ── DELETE /merchant/products/{id} ────────────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/products/{id}',
    tags: ['Merchant'],
    summary: 'Delete a product / service',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Deleted', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    await service.deleteProduct(user.id, c.req.valid('param').id);
    return c.json({ data: { message: 'Product removed.' } }, 200);
  },
);

// ── PUT /merchant/products/{id}/inventory ─────────────────────────────
router.openapi(
  createRoute({
    method: 'put',
    path: '/products/{id}/inventory',
    tags: ['Merchant'],
    summary: 'Update inventory / available stock',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(C.setInventoryBody) },
    responses: {
      200: jsonResponse('Inventory updated', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const { id } = c.req.valid('param');
    const inv = await service.setInventory(user.id, id, c.req.valid('json').availableStock);
    return c.json({ data: { productId: id, availableStock: inv.availableStock } }, 200);
  },
);

// ── GET /merchant/orders (E014) ──────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/orders',
    tags: ['Merchant'],
    summary: 'Orders placed for my products (US Vendor Orders)',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Orders', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) =>
    c.json(serializeBigInts({ data: await service.listOrders(c.get('user')!.id) }), 200),
);

// ── PATCH /merchant/orders/{id}/delivery ────────────────────────────────
router.openapi(
  createRoute({
    method: 'patch',
    path: '/orders/{id}/delivery',
    tags: ['Merchant'],
    summary: 'Update the delivery status of an order (E014)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(O.deliveryUpdateBody) },
    responses: {
      200: jsonResponse('Delivery updated', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const res = await service.updateDelivery(c.get('user')!.id, id, c.req.valid('json'));
    return c.json({ data: res }, 200);
  },
);

export default router;
