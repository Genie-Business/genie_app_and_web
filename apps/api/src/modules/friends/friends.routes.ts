import { createRoute } from '@hono/zod-openapi';
import { friends as F } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { commonErrorResponses, jsonBody, jsonResponse, z } from '../../lib/openapi';
import { requireAuth } from '../../middleware/auth';
import * as service from './friends.service';

const router = createRouter();

router.use('*', requireAuth);

const dataObj = z.object({ data: z.record(z.unknown()) });
const dataArr = z.object({ data: z.array(z.record(z.unknown())) });

// ── GET /friends ──────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Friends'],
    summary: 'My friends',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Friends', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.listFriends(c.get('user')!.id) }, 200),
);

// ── GET /friends/requests ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/requests',
    tags: ['Friends'],
    summary: 'Pending friend requests (incoming + outgoing)',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Requests', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.listRequests(c.get('user')!.id) }, 200),
);

// ── POST /friends/requests ────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/requests',
    tags: ['Friends'],
    summary: 'Send a friend request (auto-accepts a matching inbound one)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(F.sendFriendRequestBody) },
    responses: {
      201: jsonResponse('Request sent or accepted', dataObj),
      409: jsonResponse('Already friends / request pending', z.object({ error: z.record(z.unknown()) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => c.json({ data: await service.sendRequest(c.get('user')!.id, c.req.valid('json')) }, 201),
);

// ── POST /friends/requests/{id}/accept | /decline ─────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/requests/{id}/accept',
    tags: ['Friends'],
    summary: 'Accept an incoming friend request',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Accepted', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.respondToRequest(c.get('user')!.id, c.req.valid('param').id, true) }, 200),
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/requests/{id}/decline',
    tags: ['Friends'],
    summary: 'Decline an incoming friend request',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: jsonResponse('Declined', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.respondToRequest(c.get('user')!.id, c.req.valid('param').id, false) }, 200),
);

// ── DELETE /friends/requests/{id}  (cancel an outbound request) ───────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/requests/{id}',
    tags: ['Friends'],
    summary: 'Cancel a friend request you sent',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonResponse('Cancelled', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await service.cancelRequest(c.get('user')!.id, c.req.valid('param').id);
    return c.json({ data: { message: 'Request cancelled.' } }, 200);
  },
);

// ── GET /friends/blocked ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/blocked',
    tags: ['Friends'],
    summary: 'Users I have blocked',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Blocked users', dataArr), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.listBlocked(c.get('user')!.id) }, 200),
);

// ── POST /friends/import-contacts ────────────────────────────────────
router.openapi(
  createRoute({
    method: 'post',
    path: '/import-contacts',
    tags: ['Friends'],
    summary: 'Match address-book contacts to genie users (numbers hashed at rest)',
    security: [{ bearerAuth: [] }],
    request: { body: jsonBody(F.importContactsBody) },
    responses: { 200: jsonResponse('Matches', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await service.importContacts(c.get('user')!.id, c.req.valid('json')) }, 200),
);

// ── POST /friends/{userId}/block | DELETE /friends/{userId}/block ─────
router.openapi(
  createRoute({
    method: 'post',
    path: '/{userId}/block',
    tags: ['Friends'],
    summary: 'Block a user (removes any friendship / request)',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ userId: z.string() }) },
    responses: {
      200: jsonResponse('Blocked', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await service.block(c.get('user')!.id, c.req.valid('param').userId);
    return c.json({ data: { message: 'User blocked.' } }, 200);
  },
);
router.openapi(
  createRoute({
    method: 'delete',
    path: '/{userId}/block',
    tags: ['Friends'],
    summary: 'Unblock a user',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ userId: z.string() }) },
    responses: {
      200: jsonResponse('Unblocked', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await service.unblock(c.get('user')!.id, c.req.valid('param').userId);
    return c.json({ data: { message: 'User unblocked.' } }, 200);
  },
);

// ── DELETE /friends/{userId}  (unfriend) ─────────────────────────────
router.openapi(
  createRoute({
    method: 'delete',
    path: '/{userId}',
    tags: ['Friends'],
    summary: 'Remove a friend',
    security: [{ bearerAuth: [] }],
    request: { params: z.object({ userId: z.string() }) },
    responses: {
      200: jsonResponse('Unfriended', z.object({ data: z.object({ message: z.string() }) })),
      ...commonErrorResponses,
    },
  }),
  async (c) => {
    await service.unfriend(c.get('user')!.id, c.req.valid('param').userId);
    return c.json({ data: { message: 'Friend removed.' } }, 200);
  },
);

export default router;
