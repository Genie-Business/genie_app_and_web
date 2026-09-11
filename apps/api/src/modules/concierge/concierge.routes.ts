import { createRoute } from '@hono/zod-openapi';
import { concierge as C } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { serializeBigInts } from '../../lib/bigint';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { cancelRequest, createRequest, listMyRequests } from './concierge.service';

const router = createRouter();

router.use('*', requireAuth, requireVerifiedEmail);

const dataObj = z.object({ data: z.record(z.unknown()) });

// ── POST /concierge — import a gift from an external link ──────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Concierge'],
    summary: 'Import a gift from a link outside genie’s catalogue',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(C.createConciergeRequestBody) },
    responses: {
      201: jsonResponse('Request created — added to the wishlist as pending', dataObj),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    const res = await createRequest(c.get('user')!.id, c.req.valid('json'));
    return c.json(serializeBigInts({ data: res }), 201);
  },
);

// ── GET /concierge — my import requests ─────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Concierge'],
    summary: 'My import requests',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Requests', z.object({ data: z.array(z.record(z.unknown())) })), ...commonErrorResponses },
  }),
  async (c) => {
    const res = await listMyRequests(c.get('user')!.id);
    return c.json(serializeBigInts({ data: res }), 200);
  },
);

// ── DELETE /concierge/{id} — withdraw before it's reviewed ──────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Concierge'],
    summary: 'Cancel a request before a concierge has priced it',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Cancelled', dataObj), ...commonErrorResponses },
  }),
  async (c) => {
    await cancelRequest(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data: { cancelled: true } }, 200);
  },
);

export default router;
