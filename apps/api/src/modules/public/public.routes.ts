import { createRoute } from '@hono/zod-openapi';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import * as wishlists from '../wishlists/wishlists.service';

/** Unauthenticated endpoints — mounted at /v1/public. */
const router = createRouter();

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

export default router;
