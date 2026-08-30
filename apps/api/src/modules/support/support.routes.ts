import { createRoute } from '@hono/zod-openapi';
import { support as SP } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import { addMessage, createThread, getThread, listThreads } from './support.service';

const router = createRouter();

router.use('*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())) });

// ── POST / GET /support/threads ──────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/threads',
    tags: ['Support'],
    summary: 'Start a "Talk to us" conversation',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(SP.createSupportThreadBody) },
    responses: { 201: jsonResponse('Thread created', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await createThread(c.get('user')!.id, c.req.valid('json')) }, 201),
);
router.openapi(
  createRoute({
    method: 'get',
    path: '/threads',
    tags: ['Support'],
    summary: 'My support conversations',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Threads', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await listThreads(c.get('user')!.id) }, 200),
);

// ── GET /support/threads/{id} ────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/threads/{id}',
    tags: ['Support'],
    summary: 'A conversation with its messages',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Thread', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await getThread(c.get('user')!.id, c.req.valid('param').id) }, 200),
);

// ── POST /support/threads/{id}/messages ──────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/threads/{id}/messages',
    tags: ['Support'],
    summary: 'Reply to a conversation',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(SP.supportMessageBody) },
    responses: { 200: jsonResponse('Updated thread', dataObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await addMessage(c.get('user')!.id, c.req.valid('param').id, c.req.valid('json')) }, 200),
);

export default router;
