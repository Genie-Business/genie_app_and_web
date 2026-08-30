import { createRoute } from '@hono/zod-openapi';
import { prisma } from '@genie/db';
import { catalog as C } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { notFound } from '../../lib/errors';
import { requireAuth, requireRole } from '../../middleware/auth';
import { serializeBigInts } from '../../lib/bigint';
import { toCategoryDto, toProductDto } from './catalog.mapper';
import { recordActivity } from '../activities/activities.service';

const router = createRouter();

router.use('/categories/requests', requireAuth, requireRole('MERCHANT'));

const PRODUCT_INCLUDE = { images: true, inventory: true, category: true } as const;

// ── GET /categories ─────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/categories',
    tags: ['Catalog'],
    summary: 'List active product categories',
    responses: {
      200: jsonResponse('Categories', z.object({ data: z.array(z.record(z.unknown())) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const cats = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return c.json({ data: cats.map(toCategoryDto) }, 200);
  },
);

// ── POST /categories/requests ──────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/categories/requests',
    tags: ['Catalog'],
    summary: 'Request a new category (merchant)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.requestCategoryBody) },
    responses: {
      202: jsonResponse('Request logged', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const user = c.get('user')!;
    const body = c.req.valid('json');
    await recordActivity({
      userId: user.id,
      category: 'APP',
      action: 'category.requested',
      metadata: { name: body.name, note: body.note ?? null },
    });
    return c.json({ data: { message: 'Thanks — we’ll review this category request.' } }, 202);
  },
);

// ── GET /products ───────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/products',
    tags: ['Catalog'],
    summary: 'Browse active products',
    request: {
      query: z.object({
        category: z.string().optional(),
        q: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      }),
    },
    responses: {
      200: jsonResponse(
        'Products',
        z.object({ data: z.array(z.record(z.unknown())), meta: z.record(z.unknown()) }),
      ),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { category, q, page, pageSize } = c.req.valid('query');
    const where = {
      status: 'ACTIVE' as const,
      ...(category ? { OR: [{ categoryId: category }, { category: { slug: category } }] } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    return c.json(
      serializeBigInts({
        data: items.map(toProductDto),
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      }),
      200,
    );
  },
);

// ── GET /products/{id} ─────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/products/{id}',
    tags: ['Catalog'],
    summary: 'Get a product',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Product', z.object({ data: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const product = await prisma.product.findFirst({
      where: { id, status: { not: 'DELETED' } },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw notFound('Product not found.');
    return c.json(serializeBigInts({ data: toProductDto(product) }), 200);
  },
);

export default router;
