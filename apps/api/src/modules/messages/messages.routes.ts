import { createRoute } from '@hono/zod-openapi';
import { messages as M } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import {
  getThread,
  listThreads,
  markThreadRead,
  sendMessage,
  startThread,
  unreadTotal,
} from './messages.service';

const router = createRouter();

router.use('*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())), meta: z.record(z.unknown()) });

// ── GET /messages/unread-count ───────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/unread-count',
    tags: ['Messages'],
    summary: 'Total unread direct messages',
    security: [{ bearerAuth: [] }],
    responses: {
      200: jsonResponse('Count', z.object({ data: z.object({ count: z.number().int() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: { count: await unreadTotal(c.get('user')!.id) } }, 200),
);

// ── GET / POST /messages/threads ─────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/threads',
    tags: ['Messages'],
    summary: 'My conversations',
    security: [{ bearerAuth: [] }],
    request: { query: M.messageThreadListQuery },
    responses: { 200: jsonResponse('Threads', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json(await listThreads(c.get('user')!.id, c.req.valid('query')), 200),
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/threads',
    tags: ['Messages'],
    summary: 'Open (or fetch) a conversation with a friend',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(M.startThreadBody) },
    responses: {
      201: jsonResponse('Thread', dataObj),
      403: jsonResponse('Not friends / blocked', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await startThread(c.get('user')!.id, c.req.valid('json')) }, 201),
);

// ── GET /messages/threads/{id} ──────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/threads/{id}',
    tags: ['Messages'],
    summary: 'A conversation with its messages (marks incoming as read)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), query: M.messageThreadDtoQuery },
    responses: { 200: jsonResponse('Conversation', dataObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await getThread(c.get('user')!.id, c.req.valid('param').id, c.req.valid('query')) }, 200),
);

// ── POST /messages/threads/{id}/messages ────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/threads/{id}/messages',
    tags: ['Messages'],
    summary: 'Send a message',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }), body: jsonBody(M.sendMessageBody) },
    responses: { 201: jsonResponse('Conversation', dataObj), ...commonErrorResponses },
  }),
  async (c) =>
    c.json({ data: await sendMessage(c.get('user')!.id, c.req.valid('param').id, c.req.valid('json')) }, 201),
);

// ── POST /messages/threads/{id}/read ───────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/threads/{id}/read',
    tags: ['Messages'],
    summary: 'Mark a conversation read',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Marked', z.object({ data: z.object({ read: z.number().int() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await markThreadRead(c.get('user')!.id, c.req.valid('param').id) }, 200),
);

export default router;
